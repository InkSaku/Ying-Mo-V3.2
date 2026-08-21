from app.extensions import db
from app.models import PostRevision

from .conftest import auth, register, token_from


def create_article(client, token, *, title="First title", body="First body", slug="first-slug"):
    created = client.post("/api/v1/posts", headers=auth(token), json={
        "post_type": "article", "title": title, "body": body, "visibility": "login_only",
    })
    assert created.status_code == 201, created.get_json()
    post = created.get_json()["data"]
    published = client.post(
        f"/api/v1/posts/{post['id']}/publish", headers=auth(token), json={"slug": slug}
    )
    assert published.status_code == 200, published.get_json()
    return published.get_json()["data"]


def test_published_edits_create_private_revisions_and_restore_safely(client, app):
    alice_response = register(client, "revalice", nickname="Alice")
    bob_response = register(client, "revbob", nickname="Bob")
    alice_token = token_from(alice_response)
    bob_token = token_from(bob_response)
    post = create_article(client, alice_token)

    draft = client.post("/api/v1/posts", headers=auth(alice_token), json={
        "post_type": "note", "body": "draft one",
    }).get_json()["data"]
    draft_update = client.patch(
        f"/api/v1/posts/{draft['id']}/autosave", headers=auth(alice_token),
        json={"body": "draft two", "expected_version": draft["edit_version"]},
    )
    assert draft_update.status_code == 200
    with app.app_context():
        assert db.session.scalar(
            db.select(db.func.count(PostRevision.id)).where(PostRevision.post_id == draft["id"])
        ) == 0

    edited = client.patch(f"/api/v1/posts/{post['id']}", headers=auth(alice_token), json={
        "title": "Second title",
        "body": "Second body <script>alert(1)</script>",
        "slug": "second-slug",
        "expected_version": post["edit_version"],
    })
    assert edited.status_code == 200, edited.get_json()
    edited_post = edited.get_json()["data"]

    revisions = client.get(
        f"/api/v1/posts/me/{post['id']}/revisions", headers=auth(alice_token)
    )
    assert revisions.status_code == 200
    payload = revisions.get_json()
    assert payload["meta"]["pagination"]["total"] == 1
    revision = payload["data"][0]
    assert revision["title"] == "First title"
    assert revision["source_edit_version"] == post["edit_version"]
    assert set(revision["changed_fields"]) == {"title", "body", "slug"}

    assert client.get(
        f"/api/v1/posts/me/{post['id']}/revisions", headers=auth(bob_token)
    ).status_code == 404
    assert client.get(
        f"/api/v1/posts/me/{post['id']}/revisions/{revision['id']}", headers=auth(bob_token)
    ).status_code == 404

    detail = client.get(
        f"/api/v1/posts/me/{post['id']}/revisions/{revision['id']}", headers=auth(alice_token)
    ).get_json()["data"]
    assert detail["snapshot"]["body"] == "First body"
    assert "<script" not in detail["snapshot"]["rendered_html"]

    stale = client.post(
        f"/api/v1/posts/me/{post['id']}/revisions/{revision['id']}/restore",
        headers=auth(alice_token), json={"expected_version": post["edit_version"]},
    )
    assert stale.status_code == 409
    assert stale.get_json()["error"]["code"] == "EDIT_CONFLICT"

    invalid = client.post(
        f"/api/v1/posts/me/{post['id']}/revisions/{revision['id']}/restore",
        headers=auth(alice_token),
        json={"expected_version": edited_post["edit_version"], "title": "Injected"},
    )
    assert invalid.status_code == 422
    assert invalid.get_json()["error"]["code"] == "VALIDATION_ERROR"

    restored = client.post(
        f"/api/v1/posts/me/{post['id']}/revisions/{revision['id']}/restore",
        headers=auth(alice_token), json={"expected_version": edited_post["edit_version"]},
    )
    assert restored.status_code == 200, restored.get_json()
    restored_data = restored.get_json()["data"]
    assert restored_data["post"]["title"] == "First title"
    assert restored_data["post"]["body"] == "First body"
    assert restored_data["warnings"] == []
    article = client.get("/api/v1/posts/slug/first-slug", headers=auth(bob_token))
    assert article.status_code == 200
    redirect = client.get("/api/v1/posts/slug/second-slug", headers=auth(bob_token))
    assert redirect.status_code == 301

    after_restore = client.get(
        f"/api/v1/posts/me/{post['id']}/revisions", headers=auth(alice_token)
    ).get_json()
    assert after_restore["meta"]["pagination"]["total"] == 2
    assert after_restore["data"][0]["reason"] == "restore"
    current_version = restored_data["post"]["edit_version"]
    no_change = client.post(
        f"/api/v1/posts/me/{post['id']}/revisions/{revision['id']}/restore",
        headers=auth(alice_token), json={"expected_version": current_version},
    )
    assert no_change.status_code == 409
    assert no_change.get_json()["error"]["code"] == "REVISION_NO_CHANGES"


def test_restore_detaches_an_unavailable_historical_collection(client):
    alice_response = register(client, "revcollectionalice")
    bob_response = register(client, "revcollectionbob")
    alice = alice_response.get_json()["data"]["user"]
    bob = bob_response.get_json()["data"]["user"]
    alice_token = token_from(alice_response)
    collection = client.post("/api/v1/collections", headers=auth(alice_token), json={
        "name": "Old shared trip", "slug": "old-shared-trip", "member_ids": [bob["id"]],
    }).get_json()["data"]
    created = client.post("/api/v1/posts", headers=auth(alice_token), json={
        "post_type": "note", "body": "Before", "collection_id": collection["id"],
    }).get_json()["data"]
    published = client.post(
        f"/api/v1/posts/{created['id']}/publish", headers=auth(alice_token), json={}
    ).get_json()["data"]
    edited = client.patch(f"/api/v1/posts/{created['id']}", headers=auth(alice_token), json={
        "body": "After", "expected_version": published["edit_version"],
    }).get_json()["data"]
    revision = client.get(
        f"/api/v1/posts/me/{created['id']}/revisions", headers=auth(alice_token)
    ).get_json()["data"][0]

    deleted = client.delete(f"/api/v1/collections/{collection['id']}", headers=auth(alice_token))
    assert deleted.status_code == 200
    current = client.get(
        f"/api/v1/posts/me/{created['id']}", headers=auth(alice_token)
    ).get_json()["data"]
    restored = client.post(
        f"/api/v1/posts/me/{created['id']}/revisions/{revision['id']}/restore",
        headers=auth(alice_token), json={"expected_version": current["edit_version"]},
    )
    assert restored.status_code == 200, restored.get_json()
    data = restored.get_json()["data"]
    assert data["post"]["body"] == "Before"
    assert data["post"]["collection_id"] is None
    assert data["post"]["visibility"] == "private"
    assert any("Collection" in warning for warning in data["warnings"])
    assert edited["collection_id"] == collection["id"]
