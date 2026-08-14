from sqlalchemy import func

from app.extensions import db
from app.models import AdminLog, Notification, User, UserRole, UserStatus

from .conftest import auth, register, token_from


def create_user(client, name):
    response = register(client, name)
    return response.get_json()["data"]["user"], token_from(response)


def promote_admin(app, user_id):
    with app.app_context():
        user = db.session.get(User, user_id)
        user.role = UserRole.SYSTEM_ADMIN.value
        db.session.commit()


def test_admin_featured_context_order_lifecycle_home_acl_and_audit(client, app):
    admin, admin_token = create_user(client, "featureadmin")
    alice, alice_token = create_user(client, "featurealice")
    bob, bob_token = create_user(client, "featurebob")
    _, charlie_token = create_user(client, "featurecharlie")
    promote_admin(app, admin["id"])

    collection = client.post("/api/v1/collections", headers=auth(alice_token), json={
        "name": "Featured Room", "slug": "featured-room", "member_ids": [bob["id"]],
    }).get_json()["data"]
    article = client.post("/api/v1/posts", headers=auth(alice_token), json={
        "post_type": "article", "title": "Featured ACL Paper", "body": "private collection article",
        "collection_id": collection["id"],
    }).get_json()["data"]
    assert client.post(
        f"/api/v1/posts/{article['id']}/publish", headers=auth(alice_token), json={"slug": "featured-acl-paper"},
    ).status_code == 200

    assert client.get("/api/v1/admin/featured").status_code == 401
    assert client.get("/api/v1/admin/featured", headers=auth(alice_token)).status_code == 403
    assert client.post("/api/v1/admin/featured", headers=auth(admin_token), json={
        "content_type": "article", "post_id": article["id"], "sort_order": 20,
    }).status_code == 422
    assert client.post("/api/v1/admin/featured", headers=auth(admin_token), json=[]).status_code == 422
    assert client.post("/api/v1/admin/featured", headers=auth(admin_token), json={
        "content_type": "article", "post_id": article["id"], "collection_id": collection["id"],
        "reason": "invalid dual target",
    }).status_code == 422
    assert client.post("/api/v1/admin/featured", headers=auth(admin_token), json={
        "content_type": "article", "post_id": article["id"], "sort_order": True,
        "reason": "invalid boolean order",
    }).status_code == 422

    featured_article = client.post("/api/v1/admin/featured", headers=auth(admin_token), json={
        "content_type": "article", "post_id": article["id"], "sort_order": 20,
        "reason": "feature collection paper",
    })
    assert featured_article.status_code == 201
    article_item = featured_article.get_json()["data"]
    assert article_item["eligible"] is True
    assert article_item["target"]["title"] == "Featured ACL Paper"
    assert article_item["target"]["author"]["id"] == alice["id"]
    assert article_item["created_by"]["id"] == admin["id"]
    assert client.post("/api/v1/admin/featured", headers=auth(admin_token), json={
        "content_type": "article", "post_id": article["id"], "reason": "duplicate",
    }).status_code == 409

    featured_collection = client.post("/api/v1/admin/featured", headers=auth(admin_token), json={
        "content_type": "collection", "collection_id": collection["id"], "sort_order": 5,
        "reason": "feature shared room",
    })
    assert featured_collection.status_code == 201
    collection_item = featured_collection.get_json()["data"]
    assert collection_item["target"]["slug"] == "featured-room"
    assert collection_item["target"]["creator"]["id"] == alice["id"]
    listed = client.get("/api/v1/admin/featured", headers=auth(admin_token)).get_json()["data"]
    assert [item["id"] for item in listed] == [collection_item["id"], article_item["id"]]

    bob_home = client.get("/api/v1/home", headers=auth(bob_token)).get_json()["data"]
    assert [item["id"] for item in bob_home["featured_articles"]] == [article["id"]]
    assert [item["id"] for item in bob_home["featured_collections"]] == [collection["id"]]
    charlie_home = client.get("/api/v1/home", headers=auth(charlie_token)).get_json()["data"]
    assert all(item["id"] != article["id"] for item in charlie_home["featured_articles"])
    assert all(item["id"] != collection["id"] for item in charlie_home["featured_collections"])
    assert "Featured ACL Paper" not in str(charlie_home)
    assert "featured-room" not in str(charlie_home)

    assert client.patch(
        f"/api/v1/admin/featured/{article_item['id']}", headers=auth(admin_token), json={"sort_order": 1},
    ).status_code == 422
    updated = client.patch(
        f"/api/v1/admin/featured/{article_item['id']}", headers=auth(admin_token),
        json={"sort_order": 1, "reason": "move paper first"},
    )
    assert updated.status_code == 200 and updated.get_json()["data"]["sort_order"] == 1
    assert client.patch(
        f"/api/v1/admin/featured/{article_item['id']}", headers=auth(admin_token),
        json={"is_active": False, "reason": "pause paper"},
    ).status_code == 200
    assert client.get("/api/v1/home", headers=auth(bob_token)).get_json()["data"]["featured_articles"] == []
    assert client.patch(
        f"/api/v1/admin/featured/{article_item['id']}", headers=auth(admin_token),
        json={"is_active": True, "reason": "resume paper"},
    ).status_code == 200

    client.post(
        f"/api/v1/admin/posts/{article['id']}/hide", headers=auth(admin_token), json={"reason": "target review"},
    )
    invalid_item = next(
        item for item in client.get("/api/v1/admin/featured", headers=auth(admin_token)).get_json()["data"]
        if item["id"] == article_item["id"]
    )
    assert invalid_item["eligible"] is False
    assert client.get("/api/v1/home", headers=auth(bob_token)).get_json()["data"]["featured_articles"] == []
    client.patch(
        f"/api/v1/admin/featured/{article_item['id']}", headers=auth(admin_token),
        json={"is_active": False, "reason": "disable unavailable target"},
    )
    assert client.patch(
        f"/api/v1/admin/featured/{article_item['id']}", headers=auth(admin_token),
        json={"is_active": True, "reason": "must reject unavailable target"},
    ).status_code == 422
    client.post(
        f"/api/v1/admin/posts/{article['id']}/restore", headers=auth(admin_token), json={"reason": "target restored"},
    )
    assert client.patch(
        f"/api/v1/admin/featured/{article_item['id']}", headers=auth(admin_token),
        json={"is_active": True, "reason": "target eligible again"},
    ).status_code == 200

    assert client.delete(
        f"/api/v1/admin/featured/{collection_item['id']}", headers=auth(admin_token), json={},
    ).status_code == 422
    deleted = client.delete(
        f"/api/v1/admin/featured/{collection_item['id']}", headers=auth(admin_token),
        json={"reason": "remove room feature"},
    )
    assert deleted.status_code == 200 and deleted.get_json()["data"] == {"deleted": True}
    assert client.get("/api/v1/home", headers=auth(bob_token)).get_json()["data"]["featured_collections"] == []

    with app.app_context():
        actions = list(db.session.scalars(db.select(AdminLog.action).where(AdminLog.target_type == "featured")).all())
        assert actions.count("featured.create") == 2
        assert "featured.update" in actions and "featured.delete" in actions


def test_admin_settings_schema_validation_persistence_and_audit(client, app):
    admin, admin_token = create_user(client, "settingsadmin")
    _, alice_token = create_user(client, "settingsalice")
    promote_admin(app, admin["id"])

    assert client.get("/api/v1/admin/settings").status_code == 401
    assert client.get("/api/v1/admin/settings", headers=auth(alice_token)).status_code == 403
    initial = client.get("/api/v1/admin/settings", headers=auth(admin_token)).get_json()["data"]
    assert len(initial["schema"]) == 5
    assert initial["settings"]["site_name"] == "映墨"
    assert initial["settings"]["footer"] == "写字，也和朋友一起记录生活。"
    assert initial["updated_at"] is None

    invalid_payloads = [
        {"settings": {"site_name": "Paper"}},
        {"settings": {"unknown": "value"}, "reason": "unknown"},
        {"settings": {"site_name": 42}, "reason": "wrong type"},
        {"settings": {"site_name": "   "}, "reason": "empty"},
        {"settings": {"site_description": "x" * 301}, "reason": "too long"},
        {"settings": {}, "reason": "empty update"},
    ]
    for payload in invalid_payloads:
        assert client.put("/api/v1/admin/settings", headers=auth(admin_token), json=payload).status_code == 422

    values = {
        "site_name": "Paper Garden",
        "site_description": "A quiet shared writing room.",
        "about": "Long-form about copy\nwith a second line.",
        "footer": "Keep the paper warm.",
        "registration_message": "Ask the site owner for an invitation.",
    }
    saved = client.put("/api/v1/admin/settings", headers=auth(admin_token), json={
        "settings": values, "reason": "refresh public site copy",
    })
    assert saved.status_code == 200
    saved_data = saved.get_json()["data"]
    assert saved_data["settings"] == values
    assert saved_data["updated_at"] is not None
    assert client.get("/api/v1/admin/settings", headers=auth(admin_token)).get_json()["data"]["settings"] == values

    with app.app_context():
        log = db.session.scalar(db.select(AdminLog).where(AdminLog.action == "settings.update"))
        assert log.reason == "refresh public site copy"
        assert log.before_data["site_name"] == "映墨"
        assert log.after_data == values
        assert log.request_id


def test_admin_system_notifications_recipient_validation_and_log_filters(client, app):
    admin, admin_token = create_user(client, "noticeadmin")
    alice, alice_token = create_user(client, "noticealice")
    bob, bob_token = create_user(client, "noticebob")
    banned, _ = create_user(client, "noticebanned")
    promote_admin(app, admin["id"])
    with app.app_context():
        db.session.get(User, banned["id"]).status = UserStatus.BANNED.value
        db.session.commit()

    assert client.post("/api/v1/admin/notifications", json={}).status_code == 401
    assert client.post("/api/v1/admin/notifications", headers=auth(alice_token), json={
        "message": "no permission", "reason": "no permission",
    }).status_code == 403
    invalid_payloads = [
        [],
        {"message": "missing reason", "user_ids": [alice["id"]]},
        {"message": "empty", "user_ids": [], "reason": "empty recipients"},
        {"message": "boolean", "user_ids": [True], "reason": "bad id"},
        {"message": "inactive", "user_ids": [banned["id"]], "reason": "inactive"},
        {"message": "unknown", "user_ids": [999999], "reason": "unknown"},
        {"message": "x" * 501, "reason": "too long"},
    ]
    for payload in invalid_payloads:
        assert client.post("/api/v1/admin/notifications", headers=auth(admin_token), json=payload).status_code == 422

    request_id = "123e4567-e89b-42d3-a456-426614174000"
    selected_headers = {**auth(admin_token), "X-Request-ID": request_id}
    selected = client.post("/api/v1/admin/notifications", headers=selected_headers, json={
        "message": "Selected members only", "user_ids": [bob["id"], alice["id"], bob["id"]],
        "reason": "selected system message",
    })
    assert selected.status_code == 201
    assert selected.get_json()["data"] == {"scope": "selected", "recipient_count": 2}
    sent_all = client.post("/api/v1/admin/notifications", headers=auth(admin_token), json={
        "message": "All active members", "reason": "all active system message",
    })
    assert sent_all.status_code == 201
    assert sent_all.get_json()["data"] == {"scope": "all_active", "recipient_count": 3}

    alice_notices = client.get("/api/v1/notifications?page=1&page_size=20", headers=auth(alice_token)).get_json()["data"]
    bob_notices = client.get("/api/v1/notifications?page=1&page_size=20", headers=auth(bob_token)).get_json()["data"]
    assert {item["message"] for item in alice_notices} >= {"Selected members only", "All active members"}
    assert {item["message"] for item in bob_notices} >= {"Selected members only", "All active members"}
    with app.app_context():
        assert db.session.scalar(db.select(func.count(Notification.id)).where(Notification.user_id == banned["id"])) == 0

    logs = client.get("/api/v1/admin/logs?action=notification.send&target_type=notification&page=1&page_size=20", headers=auth(admin_token))
    assert logs.status_code == 200
    log_data = logs.get_json()["data"]
    assert len(log_data) == 2
    selected_log = next(item for item in log_data if item["request_id"] == request_id)
    assert selected_log["operator"]["id"] == admin["id"]
    assert selected_log["target_id"] == "system"
    assert selected_log["reason"] == "selected system message"
    assert selected_log["after"]["scope"] == "selected"
    assert selected_log["after"]["user_ids"] == sorted([alice["id"], bob["id"]])
    assert selected_log["after"]["message"] == "Selected members only"

    assert client.get(f"/api/v1/admin/logs?operator_id={admin['id']}", headers=auth(admin_token)).get_json()["meta"]["pagination"]["total"] >= 2
    assert client.get(f"/api/v1/admin/logs?request_id={request_id}", headers=auth(admin_token)).get_json()["data"][0]["request_id"] == request_id
    assert client.get("/api/v1/admin/logs?target_id=system&q=selected%20system", headers=auth(admin_token)).get_json()["data"][0]["reason"] == "selected system message"
    assert client.get("/api/v1/admin/logs?action=notification.send&page=2&page_size=1", headers=auth(admin_token)).get_json()["meta"]["pagination"]["total_pages"] == 2
    assert client.get("/api/v1/admin/logs?operator_id=0", headers=auth(admin_token)).status_code == 422
    assert client.get(f"/api/v1/admin/logs?q={'x' * 101}", headers=auth(admin_token)).status_code == 422
    assert client.get("/api/v1/admin/logs", headers=auth(alice_token)).status_code == 403
