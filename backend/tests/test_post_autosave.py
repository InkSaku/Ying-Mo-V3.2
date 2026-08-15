from sqlalchemy.orm.exc import StaleDataError

from app.extensions import db
from app.models import Post

from .conftest import auth, register, token_from


def create_draft(client, token, **overrides):
    payload = {"post_type": "article", "title": "Draft", "body": "first"}
    payload.update(overrides)
    response = client.post("/api/v1/posts", headers=auth(token), json=payload)
    assert response.status_code == 201
    return response.get_json()["data"]


def test_autosave_advances_version_and_rejects_stale_body(client):
    token = token_from(register(client, "autosave-owner"))
    draft = create_draft(client, token)
    assert draft["edit_version"] >= 1

    saved = client.patch(
        f"/api/v1/posts/{draft['id']}/autosave",
        headers=auth(token),
        json={"body": "newest", "expected_version": draft["edit_version"]},
    )
    assert saved.status_code == 200
    saved_data = saved.get_json()["data"]
    assert saved_data["body"] == "newest"
    assert saved_data["edit_version"] == draft["edit_version"] + 1

    stale = client.patch(
        f"/api/v1/posts/{draft['id']}/autosave",
        headers=auth(token),
        json={"body": "stale overwrite", "expected_version": draft["edit_version"]},
    )
    assert stale.status_code == 409
    error = stale.get_json()["error"]
    assert error["code"] == "EDIT_CONFLICT"
    assert error["details"]["current_version"] == saved_data["edit_version"]

    current = client.get(f"/api/v1/posts/me/{draft['id']}", headers=auth(token))
    assert current.get_json()["data"]["body"] == "newest"


def test_autosave_requires_version_and_only_accepts_drafts(client):
    token = token_from(register(client, "autosave-status"))
    draft = create_draft(client, token, slug="autosave-status")

    missing = client.patch(
        f"/api/v1/posts/{draft['id']}/autosave",
        headers=auth(token),
        json={"body": "missing version"},
    )
    assert missing.status_code == 422

    published = client.post(
        f"/api/v1/posts/{draft['id']}/publish",
        headers=auth(token),
        json={"slug": "autosave-status"},
    )
    assert published.status_code == 200

    refused = client.patch(
        f"/api/v1/posts/{draft['id']}/autosave",
        headers=auth(token),
        json={"body": "must not save", "expected_version": published.get_json()["data"]["edit_version"]},
    )
    assert refused.status_code == 409
    assert refused.get_json()["error"]["code"] == "AUTOSAVE_NOT_ALLOWED"


def test_manual_save_can_use_same_conflict_precondition(client):
    token = token_from(register(client, "manual-version"))
    draft = create_draft(client, token)

    saved = client.patch(
        f"/api/v1/posts/{draft['id']}",
        headers=auth(token),
        json={"title": "Manual", "expected_version": draft["edit_version"]},
    )
    assert saved.status_code == 200
    assert saved.get_json()["data"]["edit_version"] == draft["edit_version"] + 1

    stale = client.patch(
        f"/api/v1/posts/{draft['id']}",
        headers=auth(token),
        json={"title": "Old", "expected_version": draft["edit_version"]},
    )
    assert stale.status_code == 409
    assert stale.get_json()["error"]["code"] == "EDIT_CONFLICT"


def test_autosave_reports_removed_collection_without_changing_draft(client):
    owner_registration = register(client, "collection-owner")
    author_registration = register(client, "collection-author")
    owner_token = token_from(owner_registration)
    author_token = token_from(author_registration)
    author_id = author_registration.get_json()["data"]["user"]["id"]
    collection = client.post(
        "/api/v1/collections",
        headers=auth(owner_token),
        json={"name": "Shared", "slug": "autosave-shared", "member_ids": [author_id]},
    ).get_json()["data"]
    draft = create_draft(client, author_token, collection_id=collection["id"])
    client.put(
        f"/api/v1/collections/{collection['id']}/members",
        headers=auth(owner_token),
        json={"member_ids": []},
    )

    refused = client.patch(
        f"/api/v1/posts/{draft['id']}/autosave",
        headers=auth(author_token),
        json={
            "body": "local body must survive",
            "collection_id": collection["id"],
            "expected_version": draft["edit_version"],
        },
    )
    assert refused.status_code == 409
    assert refused.get_json()["error"]["code"] == "COLLECTION_UNAVAILABLE"
    current = client.get(f"/api/v1/posts/me/{draft['id']}", headers=auth(author_token))
    assert current.get_json()["data"]["body"] == "first"


def test_non_editor_post_write_returns_concurrency_conflict_and_rolls_back(
    client, app, monkeypatch,
):
    token = token_from(register(client, "archive-conflict"))
    draft = create_draft(client, token, slug="archive-conflict")
    published = client.post(
        f"/api/v1/posts/{draft['id']}/publish",
        headers=auth(token),
        json={"slug": "archive-conflict"},
    )
    assert published.status_code == 200

    original_rollback = db.session.rollback
    rollback_calls = []

    def stale_commit():
        raise StaleDataError("forced concurrent Post update")

    def tracked_rollback():
        rollback_calls.append(True)
        return original_rollback()

    monkeypatch.setattr(db.session, "commit", stale_commit)
    monkeypatch.setattr(db.session, "rollback", tracked_rollback)

    response = client.post(
        f"/api/v1/posts/{draft['id']}/archive",
        headers=auth(token),
    )

    assert response.status_code == 409
    assert response.get_json()["error"]["code"] == "CONCURRENT_MODIFICATION"
    assert rollback_calls == [True]
    with app.app_context():
        db.session.expire_all()
        assert db.session.get(Post, draft["id"]).status == "published"
