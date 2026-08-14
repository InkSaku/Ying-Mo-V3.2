from app.extensions import db
from app.models import User, UserRole, UserStatus

from .conftest import auth, register, token_from


def make_user(client, username):
    response = register(client, username)
    assert response.status_code == 201, response.get_json()
    return response.get_json()["data"]["user"], token_from(response)


def test_admin_dashboard_users_filters_pagination_and_acl_boundary(client, app):
    admin, admin_token = make_user(client, "paneladmin")
    alice, alice_token = make_user(client, "panelalice")
    bob, bob_token = make_user(client, "panelbob")
    with app.app_context():
        admin_row = db.session.get(User, admin["id"])
        admin_row.role = UserRole.SYSTEM_ADMIN.value
        db.session.commit()

    assert client.get("/api/v1/admin/dashboard").status_code == 401
    assert client.get("/api/v1/admin/dashboard", headers=auth(alice_token)).status_code == 403
    assert client.get("/api/v1/admin/users", headers=auth(alice_token)).status_code == 403

    settings = client.patch("/api/v1/users/me", headers=auth(alice_token), json={
        "nickname": "Panel Alice",
        "bio": "Admin list profile",
        "region": "Shanghai",
    })
    assert settings.status_code == 200
    assert client.post("/api/v1/auth/login", json={
        "identifier": "panelalice",
        "password": "password123",
    }).status_code == 200

    collection = client.post("/api/v1/collections", headers=auth(alice_token), json={
        "name": "Panel Collection",
        "slug": "panel-collection",
        "member_ids": [bob["id"]],
    })
    assert collection.status_code == 201

    private_note = client.post("/api/v1/posts", headers=auth(alice_token), json={
        "post_type": "note",
        "body": "Admin-only private dashboard record",
        "visibility": "private",
    }).get_json()["data"]
    assert client.post(
        f"/api/v1/posts/{private_note['id']}/publish", headers=auth(alice_token), json={}
    ).status_code == 200
    article = client.post("/api/v1/posts", headers=auth(alice_token), json={
        "post_type": "article",
        "title": "Panel Article",
        "body": "Article body",
        "visibility": "login_only",
    }).get_json()["data"]
    assert client.post(
        f"/api/v1/posts/{article['id']}/publish",
        headers=auth(alice_token),
        json={"slug": "panel-article"},
    ).status_code == 200
    draft = client.post("/api/v1/posts", headers=auth(alice_token), json={
        "post_type": "note",
        "body": "Dashboard draft",
    })
    assert draft.status_code == 201
    comment = client.post("/api/v1/comments", headers=auth(bob_token), json={
        "post_id": article["id"],
        "body": "Dashboard recent comment",
    })
    assert comment.status_code == 201

    for index in range(21):
        make_user(client, f"panelextra{index:02d}")
    with app.app_context():
        bob_row = db.session.get(User, bob["id"])
        bob_row.status = UserStatus.BANNED.value
        db.session.commit()

    assert client.get(
        f"/api/v1/posts/{private_note['id']}", headers=auth(admin_token)
    ).status_code == 404

    dashboard_response = client.get("/api/v1/admin/dashboard", headers=auth(admin_token))
    assert dashboard_response.status_code == 200
    dashboard = dashboard_response.get_json()["data"]
    assert {key: dashboard[key] for key in (
        "users", "posts", "articles", "notes", "drafts", "collections", "comments", "media"
    )} == {
        "users": 24,
        "posts": 3,
        "articles": 1,
        "notes": 2,
        "drafts": 1,
        "collections": 1,
        "comments": 1,
        "media": 0,
    }
    assert dashboard["system"] == {
        "status": "ok",
        "environment": "testing",
        "database": "sqlite",
        "media_storage": "local",
    }
    assert private_note["id"] in {item["id"] for item in dashboard["recent_posts"]}
    assert all("body" not in item for item in dashboard["recent_posts"])
    recent_comment = dashboard["recent_comments"][0]
    assert recent_comment["body"] == "Dashboard recent comment"
    assert recent_comment["author"]["username"] == "panelbob"
    assert recent_comment["post"] == {
        "id": article["id"],
        "post_type": "article",
        "title": "Panel Article",
    }
    assert recent_comment["created_at"]
    assert "approved_writers" not in dashboard
    assert "pending_reports" not in dashboard

    first_page = client.get(
        "/api/v1/admin/users?page=1&page_size=20", headers=auth(admin_token)
    ).get_json()
    second_page = client.get(
        "/api/v1/admin/users?page=2&page_size=20", headers=auth(admin_token)
    ).get_json()
    assert first_page["meta"]["pagination"]["total"] == 24
    assert len(first_page["data"]) == 20 and len(second_page["data"]) == 4

    search = client.get(
        "/api/v1/admin/users?q=Panel%20Alice", headers=auth(admin_token)
    ).get_json()
    assert len(search["data"]) == 1
    alice_item = search["data"][0]
    assert alice_item["id"] == alice["id"]
    assert alice_item["email"] == "panelalice@example.com"
    assert alice_item["bio"] == "Admin list profile"
    assert alice_item["region"] == "Shanghai"
    assert alice_item["post_count"] == 3
    assert alice_item["collection_count"] == 1
    assert alice_item["created_at"] and alice_item["updated_at"] and alice_item["last_login_at"]
    assert "password_hash" not in alice_item
    assert "can_publish" not in alice_item and "can_comment" not in alice_item

    admins = client.get(
        "/api/v1/admin/users?role=system_admin", headers=auth(admin_token)
    ).get_json()["data"]
    banned = client.get(
        "/api/v1/admin/users?status=banned", headers=auth(admin_token)
    ).get_json()["data"]
    assert [item["id"] for item in admins] == [admin["id"]]
    assert [item["id"] for item in banned] == [bob["id"]]
    assert client.get(
        "/api/v1/admin/users?role=content_admin", headers=auth(admin_token)
    ).status_code == 422
    assert client.get(
        "/api/v1/admin/users?status=reviewing", headers=auth(admin_token)
    ).status_code == 422
    assert client.get(
        "/api/v1/admin/users?page=0", headers=auth(admin_token)
    ).status_code == 422
