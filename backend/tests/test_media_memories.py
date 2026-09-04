from io import BytesIO

from PIL import Image

from .conftest import auth, register, token_from


def make_user(client, username):
    response = register(client, username)
    assert response.status_code == 201
    return response.get_json()["data"]["user"], token_from(response)


def private_jpeg():
    image = Image.new("RGB", (1800, 1200), "#8a6d4d")
    exif = Image.Exif()
    exif[270] = "private-location-metadata"
    output = BytesIO()
    image.save(output, "JPEG", quality=92, exif=exif)
    output.seek(0)
    return output


def oriented_jpeg():
    image = Image.new("RGB", (120, 80), "#405a7a")
    exif = Image.Exif()
    exif[274] = 6
    output = BytesIO()
    image.save(output, "JPEG", quality=92, exif=exif)
    output.seek(0)
    return output


def phone_heic():
    image = Image.new("RGB", (96, 128), "#58705a")
    output = BytesIO()
    image.save(output, "HEIF", quality=80)
    output.seek(0)
    return output


def upload(client, token):
    response = client.post(
        "/api/v1/uploads/images",
        headers=auth(token),
        data={"file": (private_jpeg(), "private.jpg")},
        content_type="multipart/form-data",
    )
    assert response.status_code == 201, response.get_json()
    return response.get_json()["data"]


def test_display_derivative_strips_metadata_and_original_stays_owner_only(client):
    owner, owner_token = make_user(client, "memoryowner")
    member, member_token = make_user(client, "memoryviewer")
    media = upload(client, owner_token)
    collection = client.post(
        "/api/v1/collections",
        headers=auth(owner_token),
        json={"name": "Private Media", "slug": "private-media", "member_ids": [member["id"]]},
    ).get_json()["data"]
    post = client.post(
        "/api/v1/posts",
        headers=auth(owner_token),
        json={"post_type": "note", "body": "memory", "collection_id": collection["id"]},
    ).get_json()["data"]
    assert client.post(
        f"/api/v1/uploads/{media['id']}/bind",
        headers=auth(owner_token),
        json={"bound_type": "post", "bound_id": post["id"]},
    ).status_code == 200
    assert client.post(
        f"/api/v1/posts/{post['id']}/publish", headers=auth(owner_token), json={}
    ).status_code == 200

    displayed = client.get(
        f"/api/v1/uploads/images/{media['public_id']}", headers=auth(member_token)
    )
    assert displayed.status_code == 200
    assert displayed.content_type == "image/webp"
    decoded = Image.open(BytesIO(displayed.data))
    assert decoded.width <= 2560 and decoded.height <= 2560
    assert not decoded.getexif()
    assert b"private-location-metadata" not in displayed.data
    assert client.get(
        f"/api/v1/uploads/manage/images/{media['public_id']}/original",
        headers=auth(member_token),
    ).status_code == 404
    original = client.get(
        f"/api/v1/uploads/manage/images/{media['public_id']}/original",
        headers=auth(owner_token),
    )
    assert original.status_code == 200
    assert Image.open(BytesIO(original.data)).getexif().get(270) == "private-location-metadata"


def test_upload_applies_exif_orientation_before_recording_dimensions(client):
    _, token = make_user(client, "orientedowner")
    response = client.post(
        "/api/v1/uploads/images",
        headers=auth(token),
        data={"file": (oriented_jpeg(), "portrait.jpg")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 201, response.get_json()
    media = response.get_json()["data"]
    assert (media["width"], media["height"]) == (80, 120)

    displayed = client.get(
        f"/api/v1/uploads/images/{media['public_id']}", headers=auth(token)
    )
    decoded = Image.open(BytesIO(displayed.data))
    assert decoded.size == (80, 120)
    assert not decoded.getexif()


def test_upload_accepts_heic_and_serves_safe_webp_derivative(client):
    _, token = make_user(client, "heicowner")
    response = client.post(
        "/api/v1/uploads/images",
        headers=auth(token),
        data={"file": (phone_heic(), "iphone-photo.heic")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 201, response.get_json()
    media = response.get_json()["data"]
    assert media["mime_type"] == "image/heic"
    assert media["original_filename"] == "iphone-photo.heic"
    assert (media["width"], media["height"]) == (96, 128)
    assert media["display_size"] == "medium"
    assert media["alignment"] == "center"

    displayed = client.get(
        f"/api/v1/uploads/images/{media['public_id']}", headers=auth(token)
    )
    assert displayed.status_code == 200
    assert displayed.content_type == "image/webp"
    assert Image.open(BytesIO(displayed.data)).format == "WEBP"


def test_logical_gallery_resolver_and_collection_acl_converge(client):
    owner, owner_token = make_user(client, "galleryowner")
    member, member_token = make_user(client, "gallerymember")
    media = upload(client, owner_token)
    collection = client.post(
        "/api/v1/collections",
        headers=auth(owner_token),
        json={"name": "Gallery", "slug": "gallery", "member_ids": [member["id"]]},
    ).get_json()["data"]
    post = client.post(
        "/api/v1/posts",
        headers=auth(owner_token),
        json={
            "post_type": "note",
            "body": "gallery memory",
            "collection_id": collection["id"],
            "occurred_at": "2026-05-18T10:00:00Z",
            "location": "杭州",
        },
    ).get_json()["data"]
    client.post(
        f"/api/v1/uploads/{media['id']}/bind",
        headers=auth(owner_token),
        json={"bound_type": "post", "bound_id": post["id"]},
    )
    client.post(f"/api/v1/posts/{post['id']}/publish", headers=auth(owner_token), json={})

    resolved = client.get(
        f"/api/v1/uploads/gallery/{media['public_id']}", headers=auth(member_token)
    )
    assert resolved.status_code == 200, resolved.get_json()
    item = resolved.get_json()["data"]
    assert item["id"] == media["public_id"]
    assert item["location"] == "杭州"
    assert item["post"]["id"] == post["id"]
    assert item["permissions"] == {"can_download_original": False}

    owner_gallery = client.get("/api/v1/uploads/manage/gallery", headers=auth(owner_token))
    assert owner_gallery.status_code == 200
    assert owner_gallery.get_json()["meta"]["pagination"]["total"] == 1
    assert owner_gallery.get_json()["data"][0]["permissions"]["can_download_original"] is True

    client.put(
        f"/api/v1/collections/{collection['id']}/members",
        headers=auth(owner_token),
        json={"member_ids": []},
    )
    assert client.get(
        f"/api/v1/uploads/gallery/{media['public_id']}", headers=auth(member_token)
    ).status_code == 404
    assert client.get(
        f"/api/v1/uploads/images/{media['public_id']}", headers=auth(member_token)
    ).status_code == 404
