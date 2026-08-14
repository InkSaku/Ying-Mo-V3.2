from sqlalchemy import func

from app.extensions import db
from app.models import AdminLog, Comment, Post, User, UserRole

from .conftest import auth, register, token_from


def user(client, name):
    response = register(client, name)
    return response.get_json()["data"]["user"], token_from(response)


def promote_admin(app, user_id):
    with app.app_context():
        row = db.session.get(User, user_id)
        row.role = UserRole.SYSTEM_ADMIN.value
        db.session.commit()


def test_admin_content_lists_filters_preview_acl_and_audit(client, app):
    admin, admin_token = user(client, "contentadmin")
    alice, alice_token = user(client, "contentalice")
    bob, bob_token = user(client, "contentbob")
    promote_admin(app, admin["id"])

    collection = client.post("/api/v1/collections", headers=auth(alice_token), json={
        "name": "Governance Room", "slug": "governance-room", "member_ids": [bob["id"]],
    }).get_json()["data"]
    post = client.post("/api/v1/posts", headers=auth(alice_token), json={
        "post_type": "article", "title": "Governed Paper", "body": "# private audit body",
        "collection_id": collection["id"],
    }).get_json()["data"]
    assert client.post(
        f"/api/v1/posts/{post['id']}/publish", headers=auth(alice_token), json={"slug": "governed-paper"},
    ).status_code == 200
    comment = client.post("/api/v1/comments", headers=auth(bob_token), json={
        "post_id": post["id"], "body": "governance comment",
    }).get_json()["data"]

    for path in ("/admin/posts", "/admin/collections", "/admin/comments"):
        assert client.get(f"/api/v1{path}", headers=auth(alice_token)).status_code == 403

    posts = client.get(
        f"/api/v1/admin/posts?q=audit&post_type=article&status=published&visibility=private"
        f"&moderation_status=active&author_id={alice['id']}&collection_id={collection['id']}&page=1&page_size=20",
        headers=auth(admin_token),
    )
    assert posts.status_code == 200
    assert posts.get_json()["data"][0]["id"] == post["id"]
    assert "body" not in posts.get_json()["data"][0]
    assert "deleted_at" in posts.get_json()["data"][0]
    assert client.get("/api/v1/admin/posts?post_type=video", headers=auth(admin_token)).status_code == 422
    assert client.get("/api/v1/admin/posts?author_id=-1", headers=auth(admin_token)).status_code == 422

    preview = client.get(f"/api/v1/admin/posts/{post['id']}", headers=auth(admin_token))
    assert preview.status_code == 200
    assert preview.get_json()["data"]["body"] == "# private audit body"
    assert "private audit body</h1>" in preview.get_json()["data"]["rendered_html"]

    collections = client.get(
        "/api/v1/admin/collections?q=governance&status=active", headers=auth(admin_token),
    )
    collection_item = collections.get_json()["data"][0]
    assert collection_item["id"] == collection["id"]
    assert collection_item["post_count"] == 1
    assert collection_item["members"][0]["id"] == bob["id"]
    assert "deleted_at" in collection_item
    assert client.get("/api/v1/admin/collections?status=deleted", headers=auth(admin_token)).status_code == 422

    comments = client.get(
        f"/api/v1/admin/comments?status=active&post_id={post['id']}", headers=auth(admin_token),
    )
    comment_item = comments.get_json()["data"][0]
    assert comment_item["id"] == comment["id"]
    assert comment_item["author"]["id"] == bob["id"]
    assert comment_item["post"]["title"] == "Governed Paper"
    assert comment_item["updated_at"]
    assert client.get("/api/v1/admin/comments?status=review", headers=auth(admin_token)).status_code == 422
    assert client.get("/api/v1/admin/comments?post_id=no", headers=auth(admin_token)).status_code == 422

    assert client.post(
        f"/api/v1/admin/posts/{post['id']}/hide", headers=auth(admin_token), json={},
    ).status_code == 422
    assert client.post(
        f"/api/v1/admin/posts/{post['id']}/hide", headers=auth(admin_token), json={"reason": "policy review"},
    ).status_code == 200
    assert client.get(f"/api/v1/posts/{post['id']}", headers=auth(bob_token)).status_code == 404
    assert client.post(
        f"/api/v1/admin/posts/{post['id']}/restore", headers=auth(admin_token), json={"reason": "review cleared"},
    ).status_code == 200
    assert client.get(f"/api/v1/posts/{post['id']}", headers=auth(bob_token)).status_code == 200

    hidden_comment = client.post(
        f"/api/v1/admin/comments/{comment['id']}/hide", headers=auth(admin_token), json={"reason": "off topic"},
    )
    assert hidden_comment.status_code == 200
    assert client.get(
        f"/api/v1/comments?post_id={post['id']}", headers=auth(alice_token),
    ).get_json()["data"] == []
    assert client.post(
        f"/api/v1/admin/comments/{comment['id']}/restore", headers=auth(admin_token), json={"reason": "context restored"},
    ).status_code == 200
    assert client.get(
        f"/api/v1/comments?post_id={post['id']}", headers=auth(alice_token),
    ).get_json()["data"][0]["id"] == comment["id"]

    assert client.post(
        f"/api/v1/admin/collections/{collection['id']}/hide", headers=auth(admin_token), json={"reason": "room review"},
    ).status_code == 200
    assert client.get("/api/v1/collections/governance-room", headers=auth(bob_token)).status_code == 404
    assert client.get(f"/api/v1/posts/{post['id']}", headers=auth(bob_token)).status_code == 404
    assert client.post(
        f"/api/v1/admin/collections/{collection['id']}/restore", headers=auth(admin_token), json={"reason": "room restored"},
    ).status_code == 200

    deleted_collection = client.delete(
        f"/api/v1/admin/collections/{collection['id']}", headers=auth(admin_token), json={"reason": "retire room"},
    )
    assert deleted_collection.status_code == 200
    assert deleted_collection.get_json()["data"]["mode"] == "soft"
    assert client.get("/api/v1/collections/governance-room", headers=auth(bob_token)).status_code == 404
    assert client.get(f"/api/v1/posts/{post['id']}", headers=auth(bob_token)).status_code == 404
    assert client.get(f"/api/v1/posts/{post['id']}", headers=auth(alice_token)).status_code == 200
    with app.app_context():
        post_row = db.session.get(Post, post["id"])
        assert post_row.collection_id is None and post_row.visibility == "private"

    assert client.delete(
        f"/api/v1/admin/posts/{post['id']}", headers=auth(admin_token), json={"reason": "remove paper"},
    ).status_code == 200
    assert client.get(f"/api/v1/posts/{post['id']}", headers=auth(alice_token)).status_code == 404
    assert client.post(
        f"/api/v1/admin/posts/{post['id']}/restore", headers=auth(admin_token), json={"reason": "must not restore"},
    ).status_code == 404
    deleted_preview = client.get(f"/api/v1/admin/posts/{post['id']}", headers=auth(admin_token))
    assert deleted_preview.status_code == 200 and deleted_preview.get_json()["data"]["deleted_at"]

    logs = client.get("/api/v1/admin/logs?page_size=100", headers=auth(admin_token)).get_json()["data"]
    action_reasons = {(item["action"], item["reason"]) for item in logs}
    assert {
        ("post.hide", "policy review"), ("post.restore", "review cleared"),
        ("comment.hide", "off topic"), ("comment.restore", "context restored"),
        ("collection.hide", "room review"), ("collection.restore", "room restored"),
        ("collection.delete", "retire room"), ("post.soft_delete", "remove paper"),
    } <= action_reasons
    assert sum(item["action"] == "post.preview" for item in logs) == 2


def test_admin_physical_collection_delete_and_deleted_comment_are_terminal(client, app):
    admin, admin_token = user(client, "terminaladmin")
    alice, alice_token = user(client, "terminalalice")
    bob, bob_token = user(client, "terminalbob")
    promote_admin(app, admin["id"])

    empty = client.post("/api/v1/collections", headers=auth(alice_token), json={
        "name": "Empty Room", "slug": "empty-room", "member_ids": [],
    }).get_json()["data"]
    deleted = client.delete(
        f"/api/v1/admin/collections/{empty['id']}", headers=auth(admin_token), json={"reason": "empty cleanup"},
    )
    assert deleted.status_code == 200 and deleted.get_json()["data"]["mode"] == "physical"
    assert all(
        item["id"] != empty["id"]
        for item in client.get("/api/v1/admin/collections", headers=auth(admin_token)).get_json()["data"]
    )

    post = client.post("/api/v1/posts", headers=auth(alice_token), json={
        "post_type": "note", "body": "terminal thread", "visibility": "login_only",
    }).get_json()["data"]
    client.post(f"/api/v1/posts/{post['id']}/publish", headers=auth(alice_token), json={})
    root = client.post("/api/v1/comments", headers=auth(bob_token), json={
        "post_id": post["id"], "body": "root",
    }).get_json()["data"]
    client.post("/api/v1/comments", headers=auth(alice_token), json={
        "post_id": post["id"], "body": "reply", "reply_to_comment_id": root["id"],
    })
    assert client.delete(f"/api/v1/comments/{root['id']}", headers=auth(bob_token)).status_code == 200
    deleted_comments = client.get(
        "/api/v1/admin/comments?status=deleted", headers=auth(admin_token),
    ).get_json()["data"]
    assert deleted_comments[0]["id"] == root["id"] and deleted_comments[0]["body"] is None
    assert client.post(
        f"/api/v1/admin/comments/{root['id']}/restore", headers=auth(admin_token), json={"reason": "not allowed"},
    ).status_code == 404
    with app.app_context():
        assert db.session.scalar(db.select(func.count(AdminLog.id)).where(AdminLog.action == "collection.delete")) == 1
        assert db.session.get(Comment, root["id"]).status == "deleted"
