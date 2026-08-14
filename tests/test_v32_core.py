from sqlalchemy import func

from app.extensions import db
from app.models import Collection, Post, User

from .conftest import auth, register, token_from


def make_user(client, username):
    response = register(client, username)
    assert response.status_code == 201, response.get_json()
    return response.get_json()["data"]["user"], token_from(response)


def create_article(client, token, title="Article", slug="article-one", visibility="login_only"):
    response = client.post(
        "/api/v1/posts",
        headers=auth(token),
        json={"post_type": "article", "title": title, "body": "hello", "visibility": visibility},
    )
    assert response.status_code == 201, response.get_json()
    post_id = response.get_json()["data"]["id"]
    response = client.post(
        f"/api/v1/posts/{post_id}/publish",
        headers=auth(token),
        json={"slug": slug},
    )
    assert response.status_code == 200, response.get_json()
    return post_id


def test_invite_code_required(client, app):
    bad = register(client, "alice", invite_code="wrong")
    assert bad.status_code == 422
    with app.app_context():
        assert db.session.scalar(db.select(func.count(User.id))) == 0

    good = register(client, "alice", nickname="爱丽丝")
    assert good.status_code == 201
    payload = good.get_json()["data"]["user"]
    assert payload["username"] == "alice"
    assert payload["nickname"] == "爱丽丝"
    assert "can_publish" not in payload
    assert "can_comment" not in payload


def test_anonymous_content_api_is_401(client):
    response = client.get("/api/v1/posts")
    assert response.status_code == 401
    assert response.get_json()["error"]["code"] == "AUTHENTICATION_REQUIRED"


def test_every_member_can_create_and_collection_acl(client, app):
    alice, alice_token = make_user(client, "alice")
    bob, bob_token = make_user(client, "bob")
    charlie, charlie_token = make_user(client, "charlie")

    created = client.post(
        "/api/v1/collections",
        headers=auth(alice_token),
        json={"name": "Trip", "slug": "trip", "member_ids": [bob["id"]]},
    )
    assert created.status_code == 201, created.get_json()
    collection = created.get_json()["data"]
    assert [u["id"] for u in collection["members"]] == [bob["id"]]

    assert client.get("/api/v1/collections/trip", headers=auth(bob_token)).status_code == 200
    assert client.get("/api/v1/collections/trip", headers=auth(charlie_token)).status_code == 404

    note = client.post(
        "/api/v1/posts",
        headers=auth(bob_token),
        json={
            "post_type": "note",
            "body": "共同旅行记录",
            "collection_id": collection["id"],
            "visibility": "login_only",
        },
    )
    assert note.status_code == 201, note.get_json()
    note_data = note.get_json()["data"]
    assert note_data["visibility"] == "private"
    post_id = note_data["id"]
    assert client.post(f"/api/v1/posts/{post_id}/publish", headers=auth(bob_token), json={}).status_code == 200

    assert client.get(f"/api/v1/posts/{post_id}", headers=auth(alice_token)).status_code == 200
    assert client.get(f"/api/v1/posts/{post_id}", headers=auth(bob_token)).status_code == 200
    assert client.get(f"/api/v1/posts/{post_id}", headers=auth(charlie_token)).status_code == 404

    removed = client.put(
        f"/api/v1/collections/{collection['id']}/members",
        headers=auth(alice_token),
        json={"member_ids": []},
    )
    assert removed.status_code == 200, removed.get_json()
    assert client.get("/api/v1/collections/trip", headers=auth(bob_token)).status_code == 404
    assert client.get(f"/api/v1/posts/{post_id}", headers=auth(bob_token)).status_code == 404

    mine = client.get("/api/v1/posts/me", headers=auth(bob_token))
    assert mine.status_code == 200
    assert any(item["id"] == post_id for item in mine.get_json()["data"])

    edited = client.patch(
        f"/api/v1/posts/{post_id}",
        headers=auth(bob_token),
        json={"body": "我仍能管理自己的历史 Post"},
    )
    assert edited.status_code == 200
    assert edited.get_json()["data"]["body"] == "我仍能管理自己的历史 Post"


def test_delete_collection_detaches_posts_as_private(client, app):
    alice, alice_token = make_user(client, "alice")
    bob, bob_token = make_user(client, "bob")
    created = client.post(
        "/api/v1/collections",
        headers=auth(alice_token),
        json={"name": "Shared", "slug": "shared", "member_ids": [bob["id"]]},
    )
    collection_id = created.get_json()["data"]["id"]

    note = client.post(
        "/api/v1/posts",
        headers=auth(bob_token),
        json={"post_type": "note", "body": "hello", "collection_id": collection_id},
    )
    post_id = note.get_json()["data"]["id"]
    assert client.post(f"/api/v1/posts/{post_id}/publish", headers=auth(bob_token), json={}).status_code == 200

    deleted = client.delete(f"/api/v1/collections/{collection_id}", headers=auth(alice_token))
    assert deleted.status_code == 200

    with app.app_context():
        post = db.session.get(Post, post_id)
        assert post.collection_id is None
        assert post.visibility == "private"
        collection = db.session.get(Collection, collection_id)
        assert collection.deleted_at is not None

    assert client.get(f"/api/v1/posts/{post_id}", headers=auth(bob_token)).status_code == 200
    assert client.get(f"/api/v1/posts/{post_id}", headers=auth(alice_token)).status_code == 404


def test_article_slug_history_and_no_reuse(client):
    alice, token = make_user(client, "alice")
    post_id = create_article(client, token, slug="first-slug")

    changed = client.patch(
        f"/api/v1/posts/{post_id}",
        headers=auth(token),
        json={"slug": "second-slug"},
    )
    assert changed.status_code == 200, changed.get_json()
    assert changed.get_json()["data"]["slug"] == "second-slug"

    historical = client.get("/api/v1/posts/slug/first-slug", headers=auth(token))
    assert historical.status_code == 301
    assert historical.get_json()["data"]["canonical"] == "/articles/second-slug"

    draft = client.post(
        "/api/v1/posts",
        headers=auth(token),
        json={"post_type": "article", "title": "Another", "body": "x"},
    )
    another_id = draft.get_json()["data"]["id"]
    conflict = client.post(
        f"/api/v1/posts/{another_id}/publish",
        headers=auth(token),
        json={"slug": "first-slug"},
    )
    assert conflict.status_code == 409


def test_all_authorized_members_can_comment_without_permission_flag(client):
    alice, alice_token = make_user(client, "alice")
    bob, bob_token = make_user(client, "bob")
    post_id = create_article(client, alice_token, slug="commentable")

    response = client.post(
        "/api/v1/comments",
        headers=auth(bob_token),
        json={"post_id": post_id, "body": "你好"},
    )
    assert response.status_code == 201, response.get_json()
    assert response.get_json()["data"]["body"] == "你好"


def test_post_type_locks_after_first_publish(client):
    alice, token = make_user(client, "alice")
    post_id = create_article(client, token, slug="locked-type")
    response = client.patch(
        f"/api/v1/posts/{post_id}",
        headers=auth(token),
        json={"post_type": "note"},
    )
    assert response.status_code == 422


def test_independent_private_post_is_author_only(client):
    alice, alice_token = make_user(client, "alice")
    bob, bob_token = make_user(client, "bob")
    response = client.post(
        "/api/v1/posts",
        headers=auth(alice_token),
        json={"post_type": "note", "body": "private note", "visibility": "private"},
    )
    post_id = response.get_json()["data"]["id"]
    assert client.post(f"/api/v1/posts/{post_id}/publish", headers=auth(alice_token), json={}).status_code == 200
    assert client.get(f"/api/v1/posts/{post_id}", headers=auth(alice_token)).status_code == 200
    assert client.get(f"/api/v1/posts/{post_id}", headers=auth(bob_token)).status_code == 404


def test_same_article_can_restore_old_slug_and_deleted_history_never_redirects(client):
    alice,token=make_user(client,"alice")
    bob,bob_token=make_user(client,"bob")
    post_id=create_article(client,token,slug="alpha")
    assert client.patch(f"/api/v1/posts/{post_id}",headers=auth(token),json={"slug":"beta"}).status_code==200
    restored=client.patch(f"/api/v1/posts/{post_id}",headers=auth(token),json={"slug":"alpha"})
    assert restored.status_code==200
    old=client.get("/api/v1/posts/slug/beta",headers=auth(token))
    assert old.status_code==301
    assert old.get_json()["data"]["canonical"]=="/articles/alpha"
    assert client.delete(f"/api/v1/posts/{post_id}",headers=auth(token)).status_code==200
    for slug in ("alpha","beta"):
        response=client.get(f"/api/v1/posts/slug/{slug}",headers=auth(bob_token))
        assert response.status_code==404
        assert "canonical" not in str(response.get_json())
