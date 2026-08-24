from sqlalchemy.sql.dml import Update

from app.extensions import db
from app.models import AdminLog, Collection, CollectionMember, Notification, User, UserStatus

from .conftest import auth, register, token_from


def account(client, username):
    response = register(client, username)
    return response.get_json()["data"]["user"], token_from(response)


def test_creator_transfer_is_atomic_and_preserves_member_write_access(client, app):
    alice, alice_token = account(client, "transferalice")
    bob, bob_token = account(client, "transferbob")
    collection = client.post("/api/v1/collections", headers=auth(alice_token), json={
        "name": "Long Friendship",
        "slug": "long-friendship",
        "member_ids": [bob["id"]],
        "auto_add_future_members": True,
    }).get_json()["data"]

    transferred = client.post(
        f"/api/v1/collections/{collection['id']}/transfer-creator",
        headers=auth(alice_token),
        json={"new_creator_id": bob["id"]},
    )
    assert transferred.status_code == 200
    data = transferred.get_json()["data"]
    assert data["creator"]["id"] == bob["id"]
    assert {member["id"] for member in data["members"]} == {alice["id"]}
    assert data["auto_add_future_members"] is True

    assert client.patch(
        f"/api/v1/collections/{collection['id']}",
        headers=auth(alice_token),
        json={"description": "old creator cannot manage"},
    ).status_code == 404
    managed = client.patch(
        f"/api/v1/collections/{collection['id']}",
        headers=auth(bob_token),
        json={"description": "new creator manages"},
    )
    assert managed.status_code == 200

    old_creator_post = client.post("/api/v1/posts", headers=auth(alice_token), json={
        "post_type": "note",
        "body": "I still belong here",
        "collection_id": collection["id"],
    })
    assert old_creator_post.status_code == 201
    assert client.get(
        "/api/v1/collections/long-friendship", headers=auth(alice_token)
    ).status_code == 200

    alice_notices = client.get(
        "/api/v1/notifications?page_size=100", headers=auth(alice_token)
    ).get_json()["data"]
    bob_notices = client.get(
        "/api/v1/notifications?page_size=100", headers=auth(bob_token)
    ).get_json()["data"]
    assert any(item["kind"] == "collection_creator_transferred" for item in alice_notices)
    assert any(item["kind"] == "collection_creator_received" for item in bob_notices)
    transferred_notice = next(
        item for item in alice_notices if item["kind"] == "collection_creator_transferred"
    )

    with app.app_context():
        saved = db.session.get(Collection, collection["id"])
        assert saved.creator_id == bob["id"]
        links = db.session.scalars(db.select(CollectionMember).where(
            CollectionMember.collection_id == collection["id"]
        )).all()
        assert {(link.user_id, link.join_source) for link in links} == {(alice["id"], "manual")}
        audit = db.session.scalar(db.select(AdminLog).where(
            AdminLog.action == "collection.creator_transfer",
            AdminLog.target_id == str(collection["id"]),
        ))
        assert audit.operator_id == alice["id"]
        assert audit.before_data == {"creator_id": alice["id"]}
        assert audit.after_data == {"creator_id": bob["id"]}

    assert client.put(
        f"/api/v1/collections/{collection['id']}/members",
        headers=auth(bob_token),
        json={"member_ids": []},
    ).status_code == 200
    marked_read = client.post(
        f"/api/v1/notifications/{transferred_notice['id']}/read",
        headers=auth(alice_token),
    )
    assert marked_read.status_code == 200
    safe_notice = marked_read.get_json()["data"]
    assert safe_notice["collection_id"] is None
    assert safe_notice["target_url"] is None
    assert "Long Friendship" not in safe_notice["message"]


def test_creator_transfer_rejects_invalid_targets_and_non_creator(client, app):
    alice, alice_token = account(client, "invalidalice")
    bob, bob_token = account(client, "invalidbob")
    charlie, _charlie_token = account(client, "invalidcharlie")
    collection = client.post("/api/v1/collections", headers=auth(alice_token), json={
        "name": "Transfer Rules",
        "slug": "transfer-rules",
        "member_ids": [bob["id"]],
    }).get_json()["data"]
    endpoint = f"/api/v1/collections/{collection['id']}/transfer-creator"

    assert client.post(
        endpoint, headers=auth(alice_token), json={"new_creator_id": alice["id"]}
    ).status_code == 422
    assert client.post(
        endpoint, headers=auth(alice_token), json={"new_creator_id": charlie["id"]}
    ).status_code == 422
    assert client.post(
        endpoint, headers=auth(bob_token), json={"new_creator_id": alice["id"]}
    ).status_code == 404
    assert client.post(
        endpoint, headers=auth(alice_token), json={"new_creator_id": True}
    ).status_code == 422
    assert client.post(
        endpoint, headers=auth(alice_token), json={"new_creator_id": bob["id"], "extra": 1}
    ).status_code == 422

    with app.app_context():
        target = db.session.get(User, bob["id"])
        target.status = UserStatus.BANNED.value
        db.session.commit()
    assert client.post(
        endpoint, headers=auth(alice_token), json={"new_creator_id": bob["id"]}
    ).status_code == 422

    with app.app_context():
        assert db.session.get(Collection, collection["id"]).creator_id == alice["id"]
        assert db.session.scalar(db.select(AdminLog.id).where(
            AdminLog.action == "collection.creator_transfer"
        )) is None
        assert db.session.scalar(db.select(Notification.id).where(
            Notification.kind.in_(("collection_creator_received", "collection_creator_transferred"))
        )) is None


def test_repeated_transfer_request_cannot_create_two_creators(client, app):
    alice, alice_token = account(client, "repeatalice")
    bob, _bob_token = account(client, "repeatbob")
    collection = client.post("/api/v1/collections", headers=auth(alice_token), json={
        "name": "Repeat Safe",
        "slug": "repeat-safe",
        "member_ids": [bob["id"]],
    }).get_json()["data"]
    endpoint = f"/api/v1/collections/{collection['id']}/transfer-creator"
    payload = {"new_creator_id": bob["id"]}

    assert client.post(endpoint, headers=auth(alice_token), json=payload).status_code == 200
    assert client.post(endpoint, headers=auth(alice_token), json=payload).status_code == 404

    with app.app_context():
        saved = db.session.get(Collection, collection["id"])
        assert saved.creator_id == bob["id"]
        member_ids = set(db.session.scalars(db.select(CollectionMember.user_id).where(
            CollectionMember.collection_id == collection["id"]
        )).all())
        assert member_ids == {alice["id"]}
        assert db.session.scalar(db.select(db.func.count(AdminLog.id)).where(
            AdminLog.action == "collection.creator_transfer"
        )) == 1


def test_creator_transfer_rolls_back_when_conditional_update_loses_race(client, app, monkeypatch):
    alice, alice_token = account(client, "racealice")
    bob, _bob_token = account(client, "racebob")
    collection = client.post("/api/v1/collections", headers=auth(alice_token), json={
        "name": "Race Safe",
        "slug": "race-safe",
        "member_ids": [bob["id"]],
    }).get_json()["data"]

    with app.app_context():
        original_execute = db.session.execute

        def lose_conditional_update(statement, *args, **kwargs):
            if isinstance(statement, Update):
                return type("ConflictResult", (), {"rowcount": 0})()
            return original_execute(statement, *args, **kwargs)

        monkeypatch.setattr(db.session, "execute", lose_conditional_update)
        response = client.post(
            f"/api/v1/collections/{collection['id']}/transfer-creator",
            headers=auth(alice_token),
            json={"new_creator_id": bob["id"]},
        )
        assert response.status_code == 409
        assert response.get_json()["error"]["code"] == "EDIT_CONFLICT"

        saved = db.session.get(Collection, collection["id"])
        assert saved.creator_id == alice["id"]
        member_ids = set(db.session.scalars(db.select(CollectionMember.user_id).where(
            CollectionMember.collection_id == collection["id"]
        )).all())
        assert member_ids == {bob["id"]}
        assert db.session.scalar(db.select(AdminLog.id).where(
            AdminLog.action == "collection.creator_transfer"
        )) is None
        assert db.session.scalar(db.select(Notification.id).where(
            Notification.kind.in_(("collection_creator_received", "collection_creator_transferred"))
        )) is None
