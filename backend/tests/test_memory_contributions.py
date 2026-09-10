import json
from io import BytesIO
from uuid import uuid4
from zipfile import ZipFile

from app.extensions import db
from app.models import Notification, Post, PostMemoryLink

from .conftest import auth, register, token_from


def make_user(client, username):
    response = register(client, username)
    assert response.status_code == 201
    return response.get_json()["data"]["user"], token_from(response)


def create_collection(client, token, member_ids):
    response = client.post("/api/v1/collections", headers=auth(token), json={
        "name": "毕业旅行", "slug": "graduation-trip", "member_ids": member_ids,
    })
    assert response.status_code == 201, response.get_json()
    return response.get_json()["data"]


def publish_note(client, token, collection_id, body="看到了日出"):
    response = client.post("/api/v1/posts", headers=auth(token), json={
        "post_type": "note", "collection_id": collection_id, "body": body,
        "occurred_at": "2026-07-03T05:30:00Z", "location": "海边",
    })
    assert response.status_code == 201, response.get_json()
    post = response.get_json()["data"]
    response = client.post(f"/api/v1/posts/{post['id']}/publish", headers=auth(token), json={})
    assert response.status_code == 200, response.get_json()
    return response.get_json()["data"]


def publish_article(client, token, collection_id):
    response = client.post("/api/v1/posts", headers=auth(token), json={
        "post_type": "article", "collection_id": collection_id,
        "title": "旅行手记", "body": "我们终于走到了海边。",
    })
    assert response.status_code == 201, response.get_json()
    post = response.get_json()["data"]
    response = client.post(f"/api/v1/posts/{post['id']}/publish", headers=auth(token), json={
        "slug": "travel-journal",
    })
    assert response.status_code == 200, response.get_json()
    return response.get_json()["data"]


def create_draft(client, token, source_id, request_id=None):
    response = client.post(
        f"/api/v1/posts/{source_id}/memory-contributions",
        headers=auth(token),
        json={"client_request_id": request_id or str(uuid4())},
    )
    return response


def setup_memory(client):
    creator, creator_token = make_user(client, "memoryroot")
    member, member_token = make_user(client, "memoryfriend")
    outsider, outsider_token = make_user(client, "memorystranger")
    collection = create_collection(client, creator_token, [member["id"]])
    root = publish_note(client, creator_token, collection["id"])
    return creator, creator_token, member, member_token, outsider, outsider_token, collection, root


def test_create_publish_and_read_flat_memory_thread(client, app):
    creator, creator_token, member, member_token, _, outsider_token, collection, root = setup_memory(client)
    request_id = str(uuid4())
    created = create_draft(client, member_token, root["id"], request_id)
    assert created.status_code == 201, created.get_json()
    draft = created.get_json()["data"]
    assert draft["post_type"] == "note"
    assert draft["collection_id"] == collection["id"]
    assert draft["occurred_at"].startswith("2026-07-03")
    assert draft["location"] == "海边"

    repeated = create_draft(client, member_token, root["id"], request_id)
    assert repeated.status_code == 200
    assert repeated.get_json()["data"]["id"] == draft["id"]

    before = client.get(f"/api/v1/posts/{root['id']}/memory-thread", headers=auth(creator_token))
    assert before.status_code == 200
    assert before.get_json()["data"]["contribution_count"] == 0
    assert before.get_json()["data"]["participant_count"] == 1

    saved = client.patch(f"/api/v1/posts/{draft['id']}", headers=auth(member_token), json={
        "body": "这是我从另一边拍到的日出。",
        "expected_version": draft["edit_version"],
    })
    assert saved.status_code == 200, saved.get_json()
    version = saved.get_json()["data"]["edit_version"]
    published = client.post(f"/api/v1/posts/{draft['id']}/publish", headers=auth(member_token), json={
        "expected_version": version,
    })
    assert published.status_code == 200, published.get_json()

    thread = client.get(f"/api/v1/posts/{root['id']}/memory-thread", headers=auth(creator_token))
    assert thread.status_code == 200, thread.get_json()
    data = thread.get_json()["data"]
    assert data["root_post"]["id"] == root["id"]
    assert data["contribution_count"] == 1
    assert data["participant_count"] == 2
    assert [item["id"] for item in data["items"]] == [draft["id"]]

    from_child = client.get(f"/api/v1/posts/{draft['id']}/memory-thread", headers=auth(member_token))
    assert from_child.status_code == 200
    assert from_child.get_json()["data"]["root_post"]["id"] == root["id"]
    assert from_child.get_json()["data"]["role"] == "contribution"

    nested_attempt = create_draft(client, creator_token, draft["id"])
    assert nested_attempt.status_code == 201
    nested_draft = nested_attempt.get_json()["data"]
    with app.app_context():
        nested_link = db.session.scalar(db.select(PostMemoryLink).where(
            PostMemoryLink.contribution_post_id == nested_draft["id"]
        ))
        assert nested_link.root_post_id == root["id"]

    root_detail = client.get(f"/api/v1/posts/{root['id']}", headers=auth(creator_token))
    assert root_detail.status_code == 200
    assert draft["id"] not in {
        item["id"] for item in root_detail.get_json()["data"]["experience"]["items"]
    }
    assert client.get(
        f"/api/v1/posts/{root['id']}/memory-thread", headers=auth(outsider_token)
    ).status_code == 404

    with app.app_context():
        kinds = set(db.session.scalars(db.select(Notification.kind).where(
            Notification.user_id == creator["id"],
        )).all())
        assert "memory_contribution_added" in kinds

    notifications = client.get("/api/v1/notifications", headers=auth(creator_token))
    memory_notice = next(item for item in notifications.get_json()["data"] if item["kind"] == "memory_contribution_added")
    assert memory_notice["target_url"] == f"/notes/{root['id']}#shared-memory"
    assert memory_notice["summary"] == "这是我从另一边拍到的日出。"

    exported = client.get("/api/v1/data/export", headers=auth(member_token))
    assert exported.status_code == 200
    with ZipFile(BytesIO(exported.data)) as archive:
        memory_export = json.loads(archive.read("memory_links.json"))
        manifest = json.loads(archive.read("manifest.json"))
    links = memory_export["items"]
    assert memory_export["version"] == 1
    assert any(item["contribution_post_id"] == draft["id"] for item in links)
    assert manifest["counts"]["memory_links"] == len(links)


def test_scope_is_locked_and_context_loss_keeps_private_draft(client, app):
    _, creator_token, member, member_token, _, _, collection, root = setup_memory(client)
    created = create_draft(client, member_token, root["id"])
    draft = created.get_json()["data"]

    locked = client.patch(f"/api/v1/posts/{draft['id']}", headers=auth(member_token), json={
        "collection_id": None,
    })
    assert locked.status_code == 409
    assert locked.get_json()["error"]["code"] == "MEMORY_SCOPE_LOCKED"

    removed = client.put(
        f"/api/v1/collections/{collection['id']}/members",
        headers=auth(creator_token), json={"member_ids": []},
    )
    assert removed.status_code == 200
    failed = client.post(f"/api/v1/posts/{draft['id']}/publish", headers=auth(member_token), json={
        "expected_version": draft["edit_version"],
    })
    assert failed.status_code == 409
    assert failed.get_json()["error"]["code"] == "MEMORY_CONTEXT_UNAVAILABLE"

    detached = client.post(
        f"/api/v1/posts/{draft['id']}/memory-link/detach",
        headers=auth(member_token),
        json={"expected_version": draft["edit_version"], "destination": "private"},
    )
    assert detached.status_code == 200, detached.get_json()
    assert detached.get_json()["data"]["collection_id"] is None
    assert detached.get_json()["data"]["visibility"] == "private"
    with app.app_context():
        link = db.session.scalar(db.select(PostMemoryLink).where(
            PostMemoryLink.contribution_post_id == draft["id"]
        ))
        assert link.detached_at is not None


def test_moving_root_permanently_invalidates_links_without_deleting_contribution(client, app):
    _, creator_token, _, member_token, _, _, collection, root = setup_memory(client)
    draft = create_draft(client, member_token, root["id"]).get_json()["data"]
    saved = client.patch(f"/api/v1/posts/{draft['id']}", headers=auth(member_token), json={
        "body": "另一个视角", "expected_version": draft["edit_version"],
    }).get_json()["data"]
    assert client.post(f"/api/v1/posts/{draft['id']}/publish", headers=auth(member_token), json={
        "expected_version": saved["edit_version"],
    }).status_code == 200

    removed = client.post(
        f"/api/v1/posts/{root['id']}/remove-from-collection",
        headers=auth(creator_token), json={},
    )
    assert removed.status_code == 200
    with app.app_context():
        assert db.session.get(Post, draft["id"]) is not None
        link = db.session.scalar(db.select(PostMemoryLink).where(
            PostMemoryLink.contribution_post_id == draft["id"]
        ))
        assert link.invalidated_at is not None
        assert link.invalidation_reason == "post_removed_from_collection"

    detail = client.get(f"/api/v1/posts/{draft['id']}", headers=auth(member_token))
    assert detail.status_code == 200
    assert detail.get_json()["data"]["memory"] is not None
    # It remains eligible as an ordinary collection Post, but is no longer a contribution.
    assert detail.get_json()["data"]["memory"]["role"] == "root"


def test_invalidated_draft_must_detach_before_publishing(client):
    _, creator_token, _, member_token, _, _, _, root = setup_memory(client)
    draft = create_draft(client, member_token, root["id"]).get_json()["data"]
    assert client.post(
        f"/api/v1/posts/{root['id']}/remove-from-collection",
        headers=auth(creator_token), json={},
    ).status_code == 200

    blocked = client.post(f"/api/v1/posts/{draft['id']}/publish", headers=auth(member_token), json={
        "expected_version": draft["edit_version"],
    })
    assert blocked.status_code == 409
    assert blocked.get_json()["error"]["code"] == "MEMORY_CONTEXT_UNAVAILABLE"

    detached = client.post(
        f"/api/v1/posts/{draft['id']}/memory-link/detach",
        headers=auth(member_token),
        json={"expected_version": draft["edit_version"], "destination": "private"},
    )
    assert detached.status_code == 200, detached.get_json()
    assert detached.get_json()["data"]["collection_id"] is None


def test_article_can_be_the_root_of_a_memory_thread(client):
    creator, creator_token = make_user(client, "articlememoryroot")
    member, member_token = make_user(client, "articlememoryfriend")
    collection = create_collection(client, creator_token, [member["id"]])
    root = publish_article(client, creator_token, collection["id"])

    draft = create_draft(client, member_token, root["id"]).get_json()["data"]
    assert draft["post_type"] == "note"
    assert draft["occurred_at"] is None
    thread = client.get(f"/api/v1/posts/{root['id']}/memory-thread", headers=auth(creator_token))
    assert thread.status_code == 200
    assert thread.get_json()["data"]["root_post"]["post_type"] == "article"


def test_creation_switch_hides_entry_but_keeps_existing_thread_readable(client, app):
    _, creator_token, _, member_token, _, _, _, root = setup_memory(client)
    app.config["MEMORY_CONTRIBUTIONS_ENABLED"] = False

    detail = client.get(f"/api/v1/posts/{root['id']}", headers=auth(member_token))
    assert detail.status_code == 200
    assert detail.get_json()["data"]["memory"]["can_contribute"] is False
    blocked = create_draft(client, member_token, root["id"])
    assert blocked.status_code == 503
    assert blocked.get_json()["error"]["code"] == "FEATURE_DISABLED"
