from app.extensions import db
from app.models import AdminLog, Category, Post, Tag, User, UserRole

from .conftest import auth, register, token_from


def make_user(client, username):
    response = register(client, username)
    assert response.status_code == 201
    return response.get_json()["data"]["user"], token_from(response)


def promote_admin(app, user_id):
    with app.app_context():
        row = db.session.get(User, user_id)
        row.role = UserRole.SYSTEM_ADMIN.value
        db.session.commit()


def test_admin_categories_and_tags_lifecycle_merge_acl_and_audit(client, app):
    admin, admin_token = make_user(client, "taxonomyadmin")
    alice, alice_token = make_user(client, "taxonomyalice")
    bob, bob_token = make_user(client, "taxonomybob")
    promote_admin(app, admin["id"])

    assert client.get("/api/v1/admin/categories").status_code == 401
    assert client.get("/api/v1/admin/categories", headers=auth(alice_token)).status_code == 403
    assert client.get("/api/v1/admin/tags", headers=auth(alice_token)).status_code == 403
    assert client.post("/api/v1/categories", headers=auth(alice_token), json={
        "name": "Not Allowed", "slug": "not-allowed",
    }).status_code == 403

    invalid_sort = client.post("/api/v1/categories", headers=auth(admin_token), json={
        "name": "Invalid", "slug": "invalid", "sort_order": True,
    })
    assert invalid_sort.status_code == 422
    assert client.post("/api/v1/categories", headers=auth(admin_token), json={
        "name": "Invalid", "slug": "invalid", "unknown": "field",
    }).status_code == 422

    created = client.post("/api/v1/categories", headers=auth(admin_token), json={
        "name": "Field Notes", "slug": "field-notes", "description": "Original copy",
        "sort_order": 8, "reason": "taxonomy foundation",
    })
    assert created.status_code == 201
    category = created.get_json()["data"]
    assert category["sort_order"] == 8 and category["first_used_at"] is None
    assert client.post("/api/v1/categories", headers=auth(admin_token), json={
        "name": "  field   notes ", "slug": "another-field-notes",
    }).status_code == 409

    article = client.post("/api/v1/posts", headers=auth(alice_token), json={
        "post_type": "article", "title": "Taxonomy Paper", "body": "paper body",
        "visibility": "login_only", "category_id": category["id"], "tag_names": ["Source Tag"],
    }).get_json()["data"]
    assert client.post(
        f"/api/v1/posts/{article['id']}/publish", headers=auth(alice_token), json={"slug": "taxonomy-paper"},
    ).status_code == 200

    draft = client.post("/api/v1/posts", headers=auth(alice_token), json={
        "post_type": "note", "body": "draft taxonomy", "tag_names": ["Source Tag", "Target Tag"],
    }).get_json()["data"]
    with app.app_context():
        source = db.session.scalar(db.select(Tag).where(Tag.name_normalized == "source tag"))
        target = db.session.scalar(db.select(Tag).where(Tag.name_normalized == "target tag"))
        source_id, target_id = source.id, target.id
        assert source.first_used_at is not None
        assert target.first_used_at is None
        versions_before_merge = {
            article["id"]: db.session.get(Post, article["id"]).edit_version,
            draft["id"]: db.session.get(Post, draft["id"]).edit_version,
        }

    category_list = client.get("/api/v1/admin/categories", headers=auth(admin_token)).get_json()["data"]
    tag_list = client.get("/api/v1/admin/tags", headers=auth(admin_token)).get_json()["data"]
    assert category_list[0]["post_count"] == 1
    counts = {item["id"]: item["post_count"] for item in tag_list}
    assert counts[source_id] == 2 and counts[target_id] == 1

    edited = client.patch(f"/api/v1/categories/{category['id']}", headers=auth(admin_token), json={
        "name": "Field Papers", "description": "Revised copy", "sort_order": 3,
        "reason": "editorial correction",
    })
    assert edited.status_code == 200
    assert edited.get_json()["data"]["slug"] == "field-notes"
    assert edited.get_json()["data"]["description"] == "Revised copy"
    assert client.patch(f"/api/v1/categories/{category['id']}", headers=auth(admin_token), json={
        "slug": "field-papers",
    }).status_code == 422
    assert client.patch(f"/api/v1/categories/{category['id']}", headers=auth(admin_token), json={
        "is_active": False,
    }).status_code == 422
    assert client.patch(f"/api/v1/categories/{category['id']}", headers=auth(admin_token), json={
        "is_active": False, "reason": "seasonal retirement",
    }).status_code == 200
    assert all(
        item["id"] != category["id"]
        for item in client.get("/api/v1/categories/options", headers=auth(alice_token)).get_json()["data"]
    )
    assert client.get("/api/v1/categories/field-notes", headers=auth(bob_token)).status_code == 404
    public_while_category_inactive = client.get(
        f"/api/v1/posts/{article['id']}", headers=auth(bob_token),
    ).get_json()["data"]
    assert public_while_category_inactive["category"] is None
    managed_while_category_inactive = client.get(
        f"/api/v1/posts/me/{article['id']}", headers=auth(alice_token),
    ).get_json()["data"]
    assert managed_while_category_inactive["category"]["id"] == category["id"]
    assert managed_while_category_inactive["category"]["is_active"] is False
    with app.app_context():
        assert db.session.get(Post, article["id"]).category_id == category["id"]
    assert client.patch(f"/api/v1/categories/{category['id']}", headers=auth(admin_token), json={
        "is_active": True, "reason": "category restored",
    }).status_code == 200
    assert client.get("/api/v1/categories/field-notes", headers=auth(bob_token)).status_code == 200

    corrected = client.patch(f"/api/v1/tags/{source_id}", headers=auth(admin_token), json={
        "name": "Source Corrected", "reason": "name correction",
    })
    assert corrected.status_code == 200
    assert client.patch(f"/api/v1/tags/{source_id}", headers=auth(admin_token), json={
        "slug": "source-corrected",
    }).status_code == 422
    assert client.patch(f"/api/v1/tags/{source_id}", headers=auth(admin_token), json={
        "description": "unsupported",
    }).status_code == 422
    assert client.patch(f"/api/v1/tags/{source_id}", headers=auth(alice_token), json={
        "name": "Member Rename",
    }).status_code == 403

    assert client.patch(f"/api/v1/tags/{source_id}", headers=auth(admin_token), json={
        "is_active": False,
    }).status_code == 422
    assert client.patch(f"/api/v1/tags/{source_id}", headers=auth(admin_token), json={
        "is_active": False, "reason": "tag review",
    }).status_code == 200
    assert client.get("/api/v1/tags/source-tag", headers=auth(bob_token)).status_code == 404
    public_while_tag_inactive = client.get(
        f"/api/v1/posts/{article['id']}", headers=auth(bob_token),
    ).get_json()["data"]
    assert all(item["id"] != source_id for item in public_while_tag_inactive["tags"])
    managed_while_tag_inactive = client.get(
        f"/api/v1/posts/me/{article['id']}", headers=auth(alice_token),
    ).get_json()["data"]
    assert managed_while_tag_inactive["tags"][0]["id"] == source_id
    assert managed_while_tag_inactive["tags"][0]["is_active"] is False
    assert client.patch(f"/api/v1/tags/{source_id}", headers=auth(admin_token), json={
        "is_active": True, "reason": "tag restored",
    }).status_code == 200

    assert client.post(f"/api/v1/tags/{source_id}/merge", headers=auth(admin_token), json={
        "target_id": target_id,
    }).status_code == 422
    assert client.post(f"/api/v1/tags/{source_id}/merge", headers=auth(alice_token), json={
        "target_id": target_id, "reason": "not allowed",
    }).status_code == 403
    merged = client.post(f"/api/v1/tags/{source_id}/merge", headers=auth(admin_token), json={
        "target_id": target_id, "reason": "duplicate consolidation",
    })
    assert merged.status_code == 200
    assert merged.get_json()["data"] == {
        "source_id": source_id, "target_id": target_id, "moved_posts": 2,
    }

    with app.app_context():
        source = db.session.get(Tag, source_id)
        target = db.session.get(Tag, target_id)
        article_row = db.session.get(Post, article["id"])
        draft_row = db.session.get(Post, draft["id"])
        assert source.is_active is False
        assert target.first_used_at is not None
        assert [tag.id for tag in article_row.tags] == [target_id]
        assert [tag.id for tag in draft_row.tags] == [target_id]
        assert article_row.edit_version == versions_before_merge[article["id"]] + 1
        assert draft_row.edit_version == versions_before_merge[draft["id"]] + 1

    after_merge = client.get("/api/v1/admin/tags", headers=auth(admin_token)).get_json()["data"]
    counts = {item["id"]: item["post_count"] for item in after_merge}
    states = {item["id"]: item["is_active"] for item in after_merge}
    assert counts[source_id] == 0 and counts[target_id] == 2
    assert states[source_id] is False and states[target_id] is True
    assert client.patch(f"/api/v1/tags/{target_id}", headers=auth(admin_token), json={
        "slug": "new-target-slug",
    }).status_code == 422
    assert client.get("/api/v1/tags/source-tag", headers=auth(bob_token)).status_code == 404
    target_detail = client.get("/api/v1/tags/target-tag", headers=auth(bob_token))
    assert target_detail.status_code == 200
    assert target_detail.get_json()["data"]["visible_post_count"] == 1

    logs = client.get("/api/v1/admin/logs?page_size=100", headers=auth(admin_token)).get_json()["data"]
    actions = {item["action"] for item in logs}
    reasons = {item["reason"] for item in logs}
    assert {"category.create", "category.update", "tag.update", "tag.merge"} <= actions
    assert {
        "taxonomy foundation", "seasonal retirement", "category restored",
        "tag review", "tag restored", "duplicate consolidation",
    } <= reasons
