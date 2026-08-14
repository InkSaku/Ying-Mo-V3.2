from sqlalchemy import func

from app.extensions import db
from app.models import Notification, User, UserRole

from .conftest import auth, register, token_from


def user(client, name):
    response = register(client, name)
    return response.get_json()["data"]["user"], token_from(response)


def test_notification_kinds_targets_acl_read_state_and_pagination(client, app):
    alice, alice_token = user(client, "notifyalice")
    bob, bob_token = user(client, "notifybob")
    charlie, charlie_token = user(client, "notifycharlie")
    with app.app_context():
        admin = db.session.get(User, alice["id"])
        admin.role = UserRole.SYSTEM_ADMIN.value
        db.session.commit()

    collection = client.post("/api/v1/collections", headers=auth(alice_token), json={
        "name": "Notification Secret Room",
        "slug": "notification-secret-room",
        "member_ids": [bob["id"]],
    }).get_json()["data"]
    member_notice = client.get("/api/v1/notifications", headers=auth(bob_token)).get_json()["data"][0]
    assert member_notice["kind"] == "collection_member_added"
    assert member_notice["target_url"] == "/collections/notification-secret-room"
    assert "Notification Secret Room" in member_notice["message"]

    note = client.post("/api/v1/posts", headers=auth(bob_token), json={
        "post_type": "note",
        "body": "notification post",
        "collection_id": collection["id"],
    }).get_json()["data"]
    assert client.post(
        f"/api/v1/posts/{note['id']}/publish", headers=auth(bob_token), json={}
    ).status_code == 200
    creator_notices = client.get("/api/v1/notifications", headers=auth(alice_token)).get_json()["data"]
    new_post_notice = next(item for item in creator_notices if item["kind"] == "collection_new_post")
    assert new_post_notice["target_url"] == f"/notes/{note['id']}"

    root = client.post("/api/v1/comments", headers=auth(alice_token), json={
        "post_id": note["id"],
        "body": "comment for author",
    }).get_json()["data"]
    reply = client.post("/api/v1/comments", headers=auth(bob_token), json={
        "post_id": note["id"],
        "body": "reply for commenter",
        "reply_to_comment_id": root["id"],
    })
    assert reply.status_code == 201
    bob_notices = client.get("/api/v1/notifications", headers=auth(bob_token)).get_json()["data"]
    post_comment = next(item for item in bob_notices if item["kind"] == "post_comment")
    assert post_comment["target_url"] == f"/notes/{note['id']}"
    creator_notices = client.get("/api/v1/notifications", headers=auth(alice_token)).get_json()["data"]
    comment_reply = next(item for item in creator_notices if item["kind"] == "comment_reply")
    assert comment_reply["target_url"] == f"/notes/{note['id']}"

    client.put(
        f"/api/v1/collections/{collection['id']}/members",
        headers=auth(alice_token),
        json={"member_ids": []},
    )
    removed = client.post(
        f"/api/v1/collections/{collection['id']}/remove-post",
        headers=auth(alice_token),
        json={"post_id": note["id"]},
    )
    assert removed.status_code == 200
    bob_payload = client.get("/api/v1/notifications?page=1&page_size=100", headers=auth(bob_token)).get_json()
    serialized = str(bob_payload)
    assert "Notification Secret Room" not in serialized
    assert "notification-secret-room" not in serialized
    removed_member = next(item for item in bob_payload["data"] if item["kind"] == "collection_member_removed")
    assert removed_member["collection_id"] is None
    assert removed_member["target_url"] is None
    removed_post = next(item for item in bob_payload["data"] if item["kind"] == "post_removed_from_collection")
    assert removed_post["collection_id"] is None
    assert removed_post["target_url"] == f"/write/{note['id']}"
    old_member_notice = next(item for item in bob_payload["data"] if item["kind"] == "collection_member_added")
    assert old_member_notice["collection_id"] is None
    assert old_member_notice["target_url"] is None

    for index in range(21):
        response = client.post("/api/v1/admin/notifications", headers=auth(alice_token), json={
            "message": f"system notice {index}",
            "user_ids": [charlie["id"]],
            "reason": "notification regression",
        })
        assert response.status_code == 201
    first_page = client.get(
        "/api/v1/notifications?page=1&page_size=20", headers=auth(charlie_token)
    ).get_json()
    second_page = client.get(
        "/api/v1/notifications?page=2&page_size=20", headers=auth(charlie_token)
    ).get_json()
    assert first_page["meta"]["pagination"]["total"] == 21
    assert len(first_page["data"]) == 20 and len(second_page["data"]) == 1
    assert all(item["kind"] == "system" and item["target_url"] is None for item in first_page["data"])

    notification_id = second_page["data"][0]["id"]
    assert client.post(
        f"/api/v1/notifications/{notification_id}/read", headers=auth(bob_token)
    ).status_code == 404
    assert client.post(
        f"/api/v1/notifications/{notification_id}/read", headers=auth(charlie_token)
    ).status_code == 200
    overview = client.get("/api/v1/users/me/overview", headers=auth(charlie_token)).get_json()["data"]
    assert overview["counts"]["unread_notifications"] == 20
    assert client.post("/api/v1/notifications/read-all", headers=auth(charlie_token)).status_code == 200
    overview = client.get("/api/v1/users/me/overview", headers=auth(charlie_token)).get_json()["data"]
    assert overview["counts"]["unread_notifications"] == 0

    with app.app_context():
        kinds = set(db.session.scalars(db.select(Notification.kind)).all())
        assert {
            "post_comment",
            "comment_reply",
            "collection_member_added",
            "collection_member_removed",
            "collection_new_post",
            "post_removed_from_collection",
            "system",
        } <= kinds
        assert kinds.isdisjoint({"like", "publish_permission", "collection_review", "report"})
        assert db.session.scalar(
            db.select(func.count(Notification.id)).where(Notification.user_id == charlie["id"])
        ) == 21
