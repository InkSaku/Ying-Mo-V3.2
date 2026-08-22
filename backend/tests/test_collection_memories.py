from datetime import datetime, timezone
from io import BytesIO

from PIL import Image

from app.extensions import db
from app.models import Post

from .conftest import auth, register, token_from


def make_user(client, username):
    response = register(client, username)
    assert response.status_code == 201
    return response.get_json()["data"]["user"], token_from(response)


def create_post(client, token, *, post_type, collection_id, title=None, body="memory", occurred_at=None, slug=None):
    payload = {
        "post_type": post_type,
        "collection_id": collection_id,
        "body": body,
    }
    if title:
        payload["title"] = title
    if occurred_at:
        payload["occurred_at"] = occurred_at
    response = client.post("/api/v1/posts", headers=auth(token), json=payload)
    assert response.status_code == 201, response.get_json()
    post = response.get_json()["data"]
    publish_payload = {"slug": slug} if post_type == "article" else {}
    response = client.post(f"/api/v1/posts/{post['id']}/publish", headers=auth(token), json=publish_payload)
    assert response.status_code == 200, response.get_json()
    return response.get_json()["data"]


def png_file():
    stream = BytesIO()
    Image.new("RGB", (20, 12), "#82644d").save(stream, "PNG")
    stream.seek(0)
    return stream


def test_collection_timeline_filters_facets_media_and_acl(client, app):
    creator, creator_token = make_user(client, "memorycreator")
    member, member_token = make_user(client, "memorymember")
    _, outsider_token = make_user(client, "memoryoutsider")
    collection_response = client.post("/api/v1/collections", headers=auth(creator_token), json={
        "name": "共同回忆",
        "slug": "shared-memories",
        "member_ids": [member["id"]],
    })
    collection = collection_response.get_json()["data"]

    article = create_post(
        client, creator_token, post_type="article", collection_id=collection["id"],
        title="春日文章", slug="spring-memory",
    )
    note_2024 = create_post(
        client, member_token, post_type="note", collection_id=collection["id"],
        body="海边随记", occurred_at="2024-07-12T10:00:00Z",
    )
    note_2023 = create_post(
        client, creator_token, post_type="note", collection_id=collection["id"],
        body="旧日随记", occurred_at="2023-02-02T10:00:00Z",
    )
    with app.app_context():
        row = db.session.get(Post, article["id"])
        row.published_at = datetime(2024, 3, 5, 8, tzinfo=timezone.utc)
        db.session.commit()

    timeline = client.get(
        "/api/v1/collections/shared-memories/timeline?page_size=2",
        headers=auth(member_token),
    )
    assert timeline.status_code == 200, timeline.get_json()
    payload = timeline.get_json()
    assert payload["meta"]["pagination"]["total"] == 3
    assert [item["id"] for item in payload["data"]["items"]] == [note_2024["id"], article["id"]]
    assert payload["data"]["year_facets"] == [
        {"year": 2024, "count": 2}, {"year": 2023, "count": 1},
    ]
    assert {item["username"] for item in payload["data"]["authors"]} == {
        creator["username"], member["username"],
    }

    filtered = client.get(
        f"/api/v1/collections/shared-memories/timeline?year=2024&author={member['username']}&post_type=note",
        headers=auth(member_token),
    )
    assert filtered.status_code == 200
    assert [item["id"] for item in filtered.get_json()["data"]["items"]] == [note_2024["id"]]
    assert client.get(
        "/api/v1/collections/shared-memories/timeline", headers=auth(outsider_token)
    ).status_code == 404
    assert client.get(
        "/api/v1/collections/shared-memories/media", headers=auth(outsider_token)
    ).status_code == 404

    upload = client.post(
        "/api/v1/uploads/images",
        headers=auth(member_token),
        data={"file": (png_file(), "memory.png")},
        content_type="multipart/form-data",
    )
    assert upload.status_code == 201, upload.get_json()
    media = upload.get_json()["data"]
    bind = client.post(
        f"/api/v1/uploads/{media['id']}/bind",
        headers=auth(member_token),
        json={"bound_type": "post", "bound_id": note_2024["id"]},
    )
    assert bind.status_code == 200, bind.get_json()
    wall = client.get(
        "/api/v1/collections/shared-memories/media?year=2024&post_type=note",
        headers=auth(member_token),
    )
    assert wall.status_code == 200, wall.get_json()
    assert wall.get_json()["data"]["items"][0]["media"]["id"] == media["id"]
    assert wall.get_json()["data"]["items"][0]["post"]["id"] == note_2024["id"]

    removed = client.put(
        f"/api/v1/collections/{collection['id']}/members",
        headers=auth(creator_token), json={"member_ids": []},
    )
    assert removed.status_code == 200
    assert client.get(
        "/api/v1/collections/shared-memories/timeline", headers=auth(member_token)
    ).status_code == 404


def test_collection_creator_controls_highlights_without_editing_posts(client):
    creator, creator_token = make_user(client, "highlightcreator")
    member, member_token = make_user(client, "highlightmember")
    collection = client.post("/api/v1/collections", headers=auth(creator_token), json={
        "name": "关键片段", "slug": "memory-highlights", "member_ids": [member["id"]],
    }).get_json()["data"]
    first = create_post(
        client, member_token, post_type="note", collection_id=collection["id"], body="成员的记录",
    )
    second = create_post(
        client, creator_token, post_type="article", collection_id=collection["id"],
        title="创建者的文章", slug="creator-highlight",
    )

    denied = client.put(
        f"/api/v1/collections/{collection['id']}/highlights",
        headers=auth(member_token), json={"post_ids": [first["id"]]},
    )
    assert denied.status_code == 404
    saved = client.put(
        f"/api/v1/collections/{collection['id']}/highlights",
        headers=auth(creator_token), json={"post_ids": [first["id"], second["id"]]},
    )
    assert saved.status_code == 200, saved.get_json()
    assert saved.get_json()["data"]["post_ids"] == [first["id"], second["id"]]
    detail = client.get("/api/v1/collections/memory-highlights", headers=auth(member_token)).get_json()["data"]
    assert [item["id"] for item in detail["highlights"]] == [first["id"], second["id"]]

    removed = client.post(
        f"/api/v1/collections/{collection['id']}/remove-post",
        headers=auth(creator_token), json={"post_id": first["id"]},
    )
    assert removed.status_code == 200
    detail = client.get("/api/v1/collections/memory-highlights", headers=auth(creator_token)).get_json()["data"]
    assert [item["id"] for item in detail["highlights"]] == [second["id"]]
