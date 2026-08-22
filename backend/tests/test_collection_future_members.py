from app.extensions import db
from app.models import CollectionMember, Notification

from .conftest import auth, register, token_from


def account(client, username):
    response = register(client, username)
    return response.get_json()["data"]["user"], token_from(response)


def test_future_members_auto_join_with_read_and_write_access(client, app):
    creator, creator_token = account(client, "futurecreator")
    existing, existing_token = account(client, "existingmember")
    created = client.post("/api/v1/collections", headers=auth(creator_token), json={
        "name": "Future Friends",
        "slug": "future-friends",
        "member_ids": [],
        "auto_add_future_members": True,
    })
    assert created.status_code == 201
    collection = created.get_json()["data"]
    assert collection["auto_add_future_members"] is True
    second_collection = client.post("/api/v1/collections", headers=auth(creator_token), json={
        "name": "Another Future",
        "slug": "another-future",
        "auto_add_future_members": True,
    }).get_json()["data"]

    assert client.get(
        "/api/v1/collections/future-friends", headers=auth(existing_token)
    ).status_code == 404

    newcomer, newcomer_token = account(client, "futurenewcomer")
    detail = client.get(
        "/api/v1/collections/future-friends", headers=auth(newcomer_token)
    )
    assert detail.status_code == 200
    assert client.get(
        "/api/v1/collections/another-future", headers=auth(newcomer_token)
    ).status_code == 200
    note = client.post("/api/v1/posts", headers=auth(newcomer_token), json={
        "post_type": "note",
        "body": "I can contribute",
        "collection_id": collection["id"],
    })
    assert note.status_code == 201

    notices = client.get(
        "/api/v1/notifications?page_size=100", headers=auth(newcomer_token)
    ).get_json()["data"]
    notice = next(item for item in notices if (
        item["kind"] == "collection_member_added"
        and item["collection_id"] == collection["id"]
    ))
    assert notice["target_url"] == "/collections/future-friends"
    assert "阅读并投稿" in notice["message"]

    with app.app_context():
        link = db.session.scalar(db.select(CollectionMember).where(
            CollectionMember.collection_id == collection["id"],
            CollectionMember.user_id == newcomer["id"],
        ))
        assert link.join_source == "future_member_auto"
        assert db.session.scalar(db.select(Notification.id).where(
            Notification.user_id == newcomer["id"],
            Notification.collection_id == collection["id"],
        )) is not None
        assert db.session.scalar(db.select(CollectionMember.id).where(
            CollectionMember.collection_id == second_collection["id"],
            CollectionMember.user_id == newcomer["id"],
        )) is not None


def test_disabling_future_join_preserves_existing_auto_members(client):
    creator, creator_token = account(client, "togglecreator")
    collection = client.post("/api/v1/collections", headers=auth(creator_token), json={
        "name": "Toggle Future",
        "slug": "toggle-future",
        "auto_add_future_members": True,
    }).get_json()["data"]
    first, first_token = account(client, "togglefirst")
    assert client.get(
        "/api/v1/collections/toggle-future", headers=auth(first_token)
    ).status_code == 200

    disabled = client.put(
        f"/api/v1/collections/{collection['id']}/members",
        headers=auth(creator_token),
        json={"auto_add_future_members": False},
    )
    assert disabled.status_code == 200
    assert disabled.get_json()["data"]["collection"]["auto_add_future_members"] is False
    assert client.get(
        "/api/v1/collections/toggle-future", headers=auth(first_token)
    ).status_code == 200

    removed = client.put(
        f"/api/v1/collections/{collection['id']}/members",
        headers=auth(creator_token),
        json={"member_ids": [], "auto_add_future_members": True},
    )
    assert removed.status_code == 200
    login = client.post("/api/v1/auth/login", json={
        "identifier": first["username"],
        "password": "password123",
    })
    assert login.status_code == 200
    assert client.get(
        "/api/v1/collections/toggle-future", headers=auth(token_from(login))
    ).status_code == 404

    client.put(
        f"/api/v1/collections/{collection['id']}/members",
        headers=auth(creator_token),
        json={"auto_add_future_members": False},
    )

    _second, second_token = account(client, "togglesecond")
    assert client.get(
        "/api/v1/collections/toggle-future", headers=auth(second_token)
    ).status_code == 404


def test_future_member_setting_requires_creator_and_boolean(client):
    creator, creator_token = account(client, "policycreator")
    member, member_token = account(client, "policymember")
    collection = client.post("/api/v1/collections", headers=auth(creator_token), json={
        "name": "Policy",
        "slug": "policy",
        "member_ids": [member["id"]],
    }).get_json()["data"]

    assert client.put(
        f"/api/v1/collections/{collection['id']}/members",
        headers=auth(member_token),
        json={"auto_add_future_members": True},
    ).status_code == 404
    invalid = client.put(
        f"/api/v1/collections/{collection['id']}/members",
        headers=auth(creator_token),
        json={"auto_add_future_members": "yes"},
    )
    assert invalid.status_code == 422
