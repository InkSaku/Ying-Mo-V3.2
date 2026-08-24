from datetime import datetime, timezone
from io import BytesIO
from zipfile import ZipFile

from PIL import Image
import pytest

from app.backup import create_backup, restore_backup, verify_backup
from app.extensions import db
from app.models import User

from .conftest import auth, register, token_from


def account(client, username):
    response = register(client, username)
    return response.get_json()["data"]["user"], token_from(response)


def image_file(color="#7d4931"):
    stream = BytesIO()
    Image.new("RGB", (20, 16), color).save(stream, "PNG")
    stream.seek(0)
    return stream


def test_collection_notification_preferences_keep_direct_events(client):
    alice, alice_token = account(client, "prefalice")
    bob, bob_token = account(client, "prefbob")
    charlie, charlie_token = account(client, "prefcharlie")
    collection = client.post("/api/v1/collections", headers=auth(alice_token), json={
        "name": "Quiet Room", "slug": "quiet-room", "member_ids": [bob["id"], charlie["id"]],
    }).get_json()["data"]

    assert client.put(
        f"/api/v1/collections/{collection['id']}/notification-preference",
        headers=auth(bob_token), json={"level": "important"},
    ).status_code == 200
    preference = client.get(
        f"/api/v1/collections/{collection['id']}/notification-preference",
        headers=auth(bob_token),
    ).get_json()["data"]
    assert preference["level"] == "important"

    note = client.post("/api/v1/posts", headers=auth(charlie_token), json={
        "post_type": "note", "body": "quiet update", "collection_id": collection["id"],
    }).get_json()["data"]
    assert client.post(f"/api/v1/posts/{note['id']}/publish", headers=auth(charlie_token), json={}).status_code == 200
    bob_notices = client.get("/api/v1/notifications?page_size=100", headers=auth(bob_token)).get_json()["data"]
    alice_notices = client.get("/api/v1/notifications?page_size=100", headers=auth(alice_token)).get_json()["data"]
    assert not any(item["kind"] == "collection_new_post" for item in bob_notices)
    assert any(item["kind"] == "collection_new_post" for item in alice_notices)

    assert client.put(
        f"/api/v1/collections/{collection['id']}/members",
        headers=auth(alice_token), json={"member_ids": [charlie["id"]]},
    ).status_code == 200
    bob_notices = client.get("/api/v1/notifications?page_size=100", headers=auth(bob_token)).get_json()["data"]
    assert any(item["kind"] == "collection_member_removed" for item in bob_notices)


def test_year_review_export_and_media_management(client):
    user, token = account(client, "longtermuser")
    year = datetime.now(timezone.utc).year
    note = client.post("/api/v1/posts", headers=auth(token), json={
        "post_type": "note", "body": "year memory", "occurred_at": f"{year}-03-04T12:00:00Z",
        "location": "Hangzhou", "visibility": "login_only",
    }).get_json()["data"]
    assert client.post(f"/api/v1/posts/{note['id']}/publish", headers=auth(token), json={}).status_code == 200

    first = client.post("/api/v1/uploads/images", headers=auth(token), data={
        "file": (image_file(), "memory.png"),
    }, content_type="multipart/form-data").get_json()["data"]
    second = client.post("/api/v1/uploads/images", headers=auth(token), data={
        "file": (image_file(), "memory-copy.png"),
    }, content_type="multipart/form-data").get_json()["data"]
    assert second["duplicate_of_id"] == first["id"]
    assert client.patch(
        f"/api/v1/uploads/manage/media/{first['id']}", headers=auth(token),
        json={"alt_text": "West Lake in spring"},
    ).get_json()["data"]["alt_text"] == "West Lake in spring"
    duplicates = client.get("/api/v1/uploads/manage/media/duplicates", headers=auth(token)).get_json()["data"]
    assert len(duplicates) == 1 and len(duplicates[0]["items"]) == 2
    original = client.get(first["original_download_path"], headers=auth(token))
    assert original.status_code == 200
    assert "attachment" in original.headers["Content-Disposition"]
    assert client.post("/api/v1/uploads/manage/media/batch", headers=auth(token), json={
        "media_ids": [first["id"], second["id"]], "action": "hide",
    }).status_code == 200

    review = client.get(f"/api/v1/home/year-in-review?year={year}", headers=auth(token)).get_json()["data"]
    assert review["summary"]["notes"] == 1
    assert review["summary"]["locations"] == 1
    assert review["locations"] == ["Hangzhou"]

    exported = client.get("/api/v1/data/export", headers=auth(token))
    assert exported.status_code == 200
    with ZipFile(BytesIO(exported.data)) as archive:
        names = set(archive.namelist())
        assert "manifest.json" in names and "media.json" in names
        assert any(name.startswith("posts/") and name.endswith(".md") for name in names)
        assert any(name.startswith("media/") for name in names)


def test_application_backup_can_verify_and_restore(app, client, tmp_path):
    user, _token = account(client, "backupmember")
    archive = tmp_path / "yingmo-backup.zip"
    with app.app_context():
        created = create_backup(archive)
        assert created["tables"] == len(db.metadata.tables)
        assert verify_backup(archive)["files"] >= 1
        saved = db.session.get(User, user["id"])
        saved.nickname = "Changed after backup"
        db.session.commit()
        restore_backup(archive)
        restored = db.session.get(User, user["id"])
        assert restored.nickname != "Changed after backup"
        with ZipFile(archive, "a") as bundle:
            bundle.writestr("storage/unverified.bin", b"not covered by the manifest")
        with pytest.raises(ValueError, match="unverified"):
            verify_backup(archive)
