from io import BytesIO

from PIL import Image
from sqlalchemy import func

from app.extensions import db
from app.models import AdminLog, Media, User, UserRole
from app.storage import get_storage

from .conftest import auth, register, token_from


def create_user(client, name):
    response = register(client, name)
    return response.get_json()["data"]["user"], token_from(response)


def png_bytes(color="red"):
    output = BytesIO()
    Image.new("RGB", (18, 14), color).save(output, "PNG")
    return output.getvalue()


def upload_image(client, token, color="red"):
    return client.post(
        "/api/v1/uploads/images",
        headers=auth(token),
        data={"file": (BytesIO(png_bytes(color)), "admin-media.png")},
        content_type="multipart/form-data",
    )


def upload_live_photo(client, token):
    video = b"\x00\x00\x00\x18ftypqt  " + b"v" * 64
    return client.post(
        "/api/v1/uploads/live-photos",
        headers=auth(token),
        data={
            "image": (BytesIO(png_bytes("blue")), "live.png"),
            "video": (BytesIO(video), "live.mov"),
        },
        content_type="multipart/form-data",
    )


def make_admin(app, user_id):
    with app.app_context():
        user = db.session.get(User, user_id)
        user.role = UserRole.SYSTEM_ADMIN.value
        db.session.commit()


def test_admin_media_logical_list_filters_preview_and_acl_boundary(client, app):
    admin, admin_token = create_user(client, "mediaadmin")
    alice, alice_token = create_user(client, "mediaalice")
    _, bob_token = create_user(client, "mediabob")
    make_admin(app, admin["id"])

    standalone = upload_image(client, alice_token).get_json()["data"]
    live = upload_live_photo(client, alice_token).get_json()["data"]
    post = client.post(
        "/api/v1/posts",
        headers=auth(alice_token),
        json={"post_type": "note", "body": "admin media live pair", "visibility": "login_only"},
    ).get_json()["data"]
    assert client.post(
        f"/api/v1/uploads/{live['image']['id']}/bind",
        headers=auth(alice_token),
        json={"bound_type": "post", "bound_id": post["id"]},
    ).status_code == 200
    assert client.post(f"/api/v1/posts/{post['id']}/publish", headers=auth(alice_token), json={}).status_code == 200

    assert client.get("/api/v1/admin/media").status_code == 401
    assert client.get("/api/v1/admin/media", headers=auth(alice_token)).status_code == 403
    assert client.get(f"/api/v1/admin/media/{standalone['id']}/content", headers=auth(alice_token)).status_code == 403

    listed = client.get("/api/v1/admin/media?page=1&page_size=20", headers=auth(admin_token))
    assert listed.status_code == 200
    payload = listed.get_json()
    assert payload["meta"]["pagination"]["total"] == 2
    assert {item["logical_kind"] for item in payload["data"]} == {"image", "live_photo"}
    live_item = next(item for item in payload["data"] if item["logical_kind"] == "live_photo")
    assert live_item["pair_integrity"] is True
    assert len(live_item["pair"]) == 2
    assert live_item["owner"]["username"] == alice["username"]
    assert live_item["binding"]["type"] == "post"
    assert live_item["binding"]["id"] == post["id"]
    assert live_item["binding"]["exists"] is True
    assert live_item["binding"]["status"] == "published"
    assert all(part["admin_read_path"].startswith("/api/v1/admin/media/") for part in live_item["pair"])

    assert client.get("/api/v1/admin/media?kind=image", headers=auth(admin_token)).get_json()["meta"]["pagination"]["total"] == 1
    assert client.get("/api/v1/admin/media?kind=live_photo", headers=auth(admin_token)).get_json()["meta"]["pagination"]["total"] == 1
    assert client.get(f"/api/v1/admin/media?owner_id={alice['id']}&bound_type=post", headers=auth(admin_token)).get_json()["meta"]["pagination"]["total"] == 1
    assert client.get("/api/v1/admin/media?bound_type=unbound", headers=auth(admin_token)).get_json()["meta"]["pagination"]["total"] == 1
    for query in ("kind=video", "status=deleted", "owner_id=0", "owner_id=no", "bound_type=unknown"):
        assert client.get(f"/api/v1/admin/media?{query}", headers=auth(admin_token)).status_code == 422

    # System Admin is still denied by ordinary member/owner media paths.
    assert client.get(standalone["read_path"], headers=auth(admin_token)).status_code == 404
    assert client.get(f"/api/v1/uploads/manage/images/{standalone['public_id']}", headers=auth(admin_token)).status_code == 404
    preview = client.get(f"/api/v1/admin/media/{standalone['id']}/content?thumbnail=1", headers=auth(admin_token))
    assert preview.status_code == 200
    assert preview.mimetype == "image/webp"
    assert preview.headers["Cache-Control"] == "private, no-store"
    assert client.get(f"/api/v1/admin/media/{live['video']['id']}/content?thumbnail=1", headers=auth(admin_token)).status_code == 422
    assert client.get(f"/api/v1/admin/media/{live['video']['id']}/content?thumbnail=yes", headers=auth(admin_token)).status_code == 422
    assert client.get("/api/v1/admin/media/999999/content", headers=auth(admin_token)).status_code == 404

    # Binding target ACL remains authoritative for normal users.
    assert client.get(live["image"]["read_path"], headers=auth(bob_token)).status_code == 200
    assert client.get(live["video"]["read_path"], headers=auth(bob_token)).status_code == 200
    with app.app_context():
        preview_log = db.session.scalar(db.select(AdminLog).where(AdminLog.action == "media.preview"))
        assert preview_log is not None
        assert preview_log.target_id == str(standalone["id"])


def test_admin_media_pair_moderation_delete_audit_and_storage_retention(client, app):
    admin, admin_token = create_user(client, "pairadmin")
    alice, alice_token = create_user(client, "pairalice")
    _, bob_token = create_user(client, "pairbob")
    make_admin(app, admin["id"])

    live = upload_live_photo(client, alice_token).get_json()["data"]
    post = client.post(
        "/api/v1/posts",
        headers=auth(alice_token),
        json={"post_type": "note", "body": "pair moderation", "visibility": "login_only"},
    ).get_json()["data"]
    client.post(
        f"/api/v1/uploads/{live['image']['id']}/bind",
        headers=auth(alice_token),
        json={"bound_type": "post", "bound_id": post["id"]},
    )
    client.post(f"/api/v1/posts/{post['id']}/publish", headers=auth(alice_token), json={})

    media_id = live["image"]["id"]
    assert client.post(f"/api/v1/admin/media/{media_id}/hide", headers=auth(admin_token), json={}).status_code == 422
    hidden = client.post(
        f"/api/v1/admin/media/{media_id}/hide",
        headers=auth(admin_token),
        json={"reason": "pair requires review"},
    )
    assert hidden.status_code == 200
    assert len(hidden.get_json()["data"]["media"]) == 2
    assert {item["status"] for item in hidden.get_json()["data"]["media"]} == {"hidden"}
    assert client.get(live["image"]["read_path"], headers=auth(bob_token)).status_code == 404
    assert client.get(live["video"]["read_path"], headers=auth(bob_token)).status_code == 404

    # Repeating a state transition is safe and still auditable.
    assert client.post(
        f"/api/v1/admin/media/{media_id}/hide",
        headers=auth(admin_token),
        json={"reason": "confirm hidden state"},
    ).status_code == 200
    restored = client.post(
        f"/api/v1/admin/media/{media_id}/restore",
        headers=auth(admin_token),
        json={"reason": "review cleared"},
    )
    assert restored.status_code == 200
    assert client.get(live["image"]["read_path"], headers=auth(bob_token)).status_code == 200
    assert client.get(live["video"]["read_path"], headers=auth(bob_token)).status_code == 200

    with app.app_context():
        rows = list(db.session.scalars(db.select(Media).where(Media.live_photo_pair_id == live["pair_id"])).all())
        storage_keys = [row.storage_key for row in rows]
        assert all(get_storage().exists(key) for key in storage_keys)

    deleted = client.delete(
        f"/api/v1/admin/media/{media_id}",
        headers=auth(admin_token),
        json={"reason": "retire rejected pair"},
    )
    assert deleted.status_code == 200
    assert set(deleted.get_json()["data"]["media_ids"]) == {live["image"]["id"], live["video"]["id"]}
    assert client.get(live["image"]["read_path"], headers=auth(bob_token)).status_code == 404
    assert client.get(live["video"]["read_path"], headers=auth(bob_token)).status_code == 404
    assert client.post(
        f"/api/v1/admin/media/{media_id}/restore",
        headers=auth(admin_token),
        json={"reason": "should remain terminal"},
    ).status_code == 404

    # Deleted assets remain visible only through the audited Admin endpoint.
    assert client.get(f"/api/v1/admin/media/{media_id}/content", headers=auth(admin_token)).status_code == 200
    listed = client.get("/api/v1/admin/media?kind=live_photo&status=hidden", headers=auth(admin_token)).get_json()["data"]
    assert len(listed) == 1
    assert listed[0]["deleted_at"] is not None
    assert all(part["deleted_at"] is not None for part in listed[0]["pair"])

    with app.app_context():
        rows = list(db.session.scalars(db.select(Media).where(Media.live_photo_pair_id == live["pair_id"])).all())
        assert all(row.deleted_at is not None and row.status == "hidden" for row in rows)
        assert all(get_storage().exists(key) for key in storage_keys)
        assert db.session.scalar(db.select(func.count(AdminLog.id)).where(AdminLog.action == "media.hide")) == 2
        reasons = {
            row.reason for row in db.session.scalars(db.select(AdminLog).where(
                AdminLog.action.in_({"media.hide", "media.restore", "media.soft_delete"})
            )).all()
        }
        assert {"pair requires review", "confirm hidden state", "review cleared", "retire rejected pair"} <= reasons


def test_admin_media_rejects_inconsistent_live_photo_pair(client, app):
    admin, admin_token = create_user(client, "brokenadmin")
    _, alice_token = create_user(client, "brokenalice")
    make_admin(app, admin["id"])
    live = upload_live_photo(client, alice_token).get_json()["data"]

    with app.app_context():
        video = db.session.get(Media, live["video"]["id"])
        video.status = "hidden"
        db.session.commit()

    listed = client.get("/api/v1/admin/media?kind=live_photo", headers=auth(admin_token)).get_json()["data"]
    assert listed[0]["pair_integrity"] is False
    response = client.post(
        f"/api/v1/admin/media/{live['image']['id']}/hide",
        headers=auth(admin_token),
        json={"reason": "must not partially mutate"},
    )
    assert response.status_code == 409
    with app.app_context():
        assert db.session.get(Media, live["image"]["id"]).status == "active"
        assert db.session.get(Media, live["video"]["id"]).status == "hidden"
