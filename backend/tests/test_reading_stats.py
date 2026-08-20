from datetime import datetime, timedelta, timezone

from sqlalchemy import func

from app.extensions import db
from app.models import PostReadEvent

from .conftest import auth, register, token_from


def make_user(client, username):
    response = register(client, username)
    assert response.status_code == 201, response.get_json()
    return response.get_json()["data"]["user"], token_from(response)


def create_article(client, token, *, slug, visibility="login_only"):
    response = client.post(
        "/api/v1/posts",
        headers=auth(token),
        json={
            "post_type": "article",
            "title": f"Article {slug}",
            "body": "hello",
            "visibility": visibility,
        },
    )
    assert response.status_code == 201, response.get_json()
    post_id = response.get_json()["data"]["id"]
    published = client.post(
        f"/api/v1/posts/{post_id}/publish",
        headers=auth(token),
        json={"slug": slug},
    )
    assert published.status_code == 200, published.get_json()
    return post_id


def bucket_start(value):
    return value.replace(
        minute=(value.minute // 30) * 30,
        second=0,
        microsecond=0,
    )


def test_read_events_ignore_author_dedupe_and_expose_only_author_aggregates(client, app):
    alice, alice_token = make_user(client, "alice")
    bob, bob_token = make_user(client, "bob")
    charlie, charlie_token = make_user(client, "charlie")
    post_id = create_article(client, alice_token, slug="reading-stats")

    anonymous = client.post(f"/api/v1/posts/{post_id}/read", json={})
    assert anonymous.status_code == 401

    own = client.post(
        f"/api/v1/posts/{post_id}/read",
        headers=auth(alice_token),
        json={},
    )
    assert own.status_code == 200
    assert own.get_json()["data"]["recorded"] is False

    first = client.post(
        f"/api/v1/posts/{post_id}/read",
        headers=auth(bob_token),
        json={},
    )
    duplicate = client.post(
        f"/api/v1/posts/{post_id}/read",
        headers=auth(bob_token),
        json={},
    )
    second_reader = client.post(
        f"/api/v1/posts/{post_id}/read",
        headers=auth(charlie_token),
        json={},
    )
    assert first.get_json()["data"]["recorded"] is True
    assert duplicate.get_json()["data"]["recorded"] is False
    assert second_reader.get_json()["data"]["recorded"] is True

    denied = client.get(
        f"/api/v1/posts/{post_id}/reading-stats",
        headers=auth(bob_token),
    )
    assert denied.status_code == 404

    stats = client.get(
        f"/api/v1/posts/{post_id}/reading-stats",
        headers=auth(alice_token),
    )
    assert stats.status_code == 200
    assert stats.get_json()["data"] == {
        "post_id": post_id,
        "views": 2,
        "unique_readers": 2,
        "views_7d": 2,
        "views_30d": 2,
    }

    mine = client.get(
        "/api/v1/posts/me?page=1&page_size=20",
        headers=auth(alice_token),
    )
    assert mine.status_code == 200
    row = next(item for item in mine.get_json()["data"] if item["id"] == post_id)
    assert row["reading_stats"] == {
        "views": 2,
        "unique_readers": 2,
        "views_7d": 2,
        "views_30d": 2,
    }

    with app.app_context():
        assert db.session.scalar(
            db.select(func.count(PostReadEvent.id))
        ) == 2


def test_read_events_follow_private_and_collection_acl(client):
    alice, alice_token = make_user(client, "acl-alice")
    bob, bob_token = make_user(client, "acl-bob")
    charlie, charlie_token = make_user(client, "acl-charlie")

    private_post_id = create_article(
        client,
        alice_token,
        slug="private-reading",
        visibility="private",
    )
    private_denied = client.post(
        f"/api/v1/posts/{private_post_id}/read",
        headers=auth(bob_token),
        json={},
    )
    assert private_denied.status_code == 404

    collection = client.post(
        "/api/v1/collections",
        headers=auth(alice_token),
        json={
            "name": "Reading Circle",
            "slug": "reading-circle",
            "member_ids": [bob["id"]],
        },
    )
    assert collection.status_code == 201, collection.get_json()
    collection_id = collection.get_json()["data"]["id"]

    note = client.post(
        "/api/v1/posts",
        headers=auth(alice_token),
        json={
            "post_type": "note",
            "body": "shared memory",
            "collection_id": collection_id,
        },
    )
    assert note.status_code == 201, note.get_json()
    note_id = note.get_json()["data"]["id"]
    published = client.post(
        f"/api/v1/posts/{note_id}/publish",
        headers=auth(alice_token),
        json={},
    )
    assert published.status_code == 200, published.get_json()

    allowed = client.post(
        f"/api/v1/posts/{note_id}/read",
        headers=auth(bob_token),
        json={},
    )
    assert allowed.status_code == 200
    assert allowed.get_json()["data"]["recorded"] is True

    never_member = client.post(
        f"/api/v1/posts/{note_id}/read",
        headers=auth(charlie_token),
        json={},
    )
    assert never_member.status_code == 404

    removed = client.put(
        f"/api/v1/collections/{collection_id}/members",
        headers=auth(alice_token),
        json={"member_ids": []},
    )
    assert removed.status_code == 200, removed.get_json()

    after_removal = client.post(
        f"/api/v1/posts/{note_id}/read",
        headers=auth(bob_token),
        json={},
    )
    assert after_removal.status_code == 404

    stats = client.get(
        f"/api/v1/posts/{note_id}/reading-stats",
        headers=auth(alice_token),
    )
    assert stats.status_code == 200
    assert stats.get_json()["data"]["views"] == 1
    assert stats.get_json()["data"]["unique_readers"] == 1


def test_reading_stats_windows_are_aggregated_from_events(client, app):
    alice, alice_token = make_user(client, "window-alice")
    bob, bob_token = make_user(client, "window-bob")
    charlie, _ = make_user(client, "window-charlie")
    post_id = create_article(client, alice_token, slug="reading-windows")

    current = client.post(
        f"/api/v1/posts/{post_id}/read",
        headers=auth(bob_token),
        json={},
    )
    assert current.status_code == 200
    assert current.get_json()["data"]["recorded"] is True

    now = datetime.now(timezone.utc)
    eight_days_ago = now - timedelta(days=8)
    thirty_one_days_ago = now - timedelta(days=31)
    with app.app_context():
        db.session.add_all([
            PostReadEvent(
                post_id=post_id,
                reader_id=bob["id"],
                bucket_start=bucket_start(eight_days_ago),
                created_at=eight_days_ago,
            ),
            PostReadEvent(
                post_id=post_id,
                reader_id=charlie["id"],
                bucket_start=bucket_start(thirty_one_days_ago),
                created_at=thirty_one_days_ago,
            ),
        ])
        db.session.commit()

    stats = client.get(
        f"/api/v1/posts/{post_id}/reading-stats",
        headers=auth(alice_token),
    )
    assert stats.status_code == 200
    assert stats.get_json()["data"] == {
        "post_id": post_id,
        "views": 3,
        "unique_readers": 2,
        "views_7d": 1,
        "views_30d": 2,
    }
