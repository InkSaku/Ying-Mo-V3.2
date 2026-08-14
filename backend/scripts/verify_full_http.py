"""Run the Stage 20 cross-module acceptance flow against a disposable live server."""

from __future__ import annotations

import argparse
import json
import uuid
from io import BytesIO
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from PIL import Image


class LiveApi:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    def request(self, method, path, *, token=None, payload=None, body=None, content_type=None, expected=200):
        headers = {"Accept": "application/json", "X-Request-ID": str(uuid.uuid4())}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if payload is not None:
            body = json.dumps(payload, ensure_ascii=False).encode()
            headers["Content-Type"] = "application/json"
        elif content_type:
            headers["Content-Type"] = content_type
        request = Request(f"{self.base_url}{path}", data=body, headers=headers, method=method)
        try:
            response = urlopen(request, timeout=10)
            status, raw, response_type = response.status, response.read(), response.headers.get_content_type()
        except HTTPError as error:
            status, raw, response_type = error.code, error.read(), error.headers.get_content_type()
        if status != expected:
            raise AssertionError(f"{method} {path}: expected {expected}, got {status}: {raw[:800]!r}")
        if response_type == "application/json" and raw:
            return json.loads(raw)
        return raw

    def get(self, path, token=None, expected=200):
        return self.request("GET", path, token=token, expected=expected)

    def post(self, path, token=None, payload=None, expected=200):
        return self.request("POST", path, token=token, payload=payload, expected=expected)

    def patch(self, path, token=None, payload=None, expected=200):
        return self.request("PATCH", path, token=token, payload=payload, expected=expected)

    def put(self, path, token=None, payload=None, expected=200):
        return self.request("PUT", path, token=token, payload=payload, expected=expected)


def data(response):
    return response["data"]


def register(api, username):
    response = api.post("/api/v1/auth/register", payload={
        "username": username,
        "nickname": username.title(),
        "email": f"{username}@stage20.invalid",
        "password": "password123",
        "invite_code": "stage20-invite",
    }, expected=201)
    return data(response)["user"], data(response)["access_token"]


def login(api, username, password="password123"):
    return data(api.post("/api/v1/auth/login", payload={"identifier": username, "password": password}))["access_token"]


def upload_image(api, token):
    image = BytesIO()
    Image.new("RGB", (16, 12), "#8f3529").save(image, "PNG")
    boundary = f"yingmo-{uuid.uuid4().hex}"
    body = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="file"; filename="stage20.png"\r\n'
        "Content-Type: image/png\r\n\r\n"
    ).encode() + image.getvalue() + f"\r\n--{boundary}--\r\n".encode()
    return data(api.request(
        "POST", "/api/v1/uploads/images", token=token, body=body,
        content_type=f"multipart/form-data; boundary={boundary}", expected=201,
    ))


def assert_absent(payload, *needles):
    serialized = json.dumps(payload, ensure_ascii=False)
    for needle in needles:
        assert str(needle) not in serialized, f"unexpected ACL disclosure: {needle}"


def run(base_url):
    api = LiveApi(base_url)
    checks = []

    api.get("/api/v1/posts", expected=401)
    admin_token = login(api, "stage20admin")
    alice, alice_token = register(api, "stage20alice")
    bob, bob_token = register(api, "stage20bob")
    charlie, charlie_token = register(api, "stage20charlie")
    assert data(api.get("/api/v1/auth/me", alice_token))["username"] == alice["username"]
    alice_token = login(api, "stage20alice")
    assert len(data(api.get("/api/v1/auth/sessions", alice_token))) >= 2
    api.patch("/api/v1/users/me", alice_token, {"nickname": "Stage 20 Alice", "bio": "最终联调账号"})
    assert data(api.get("/api/v1/users/me/settings", alice_token))["nickname"] == "Stage 20 Alice"
    checks.append("Auth")

    category = data(api.post("/api/v1/categories", admin_token, {
        "name": "Stage 20 Papers", "slug": "stage-20-papers", "description": "Final acceptance",
        "sort_order": 20, "reason": "stage 20 acceptance",
    }, expected=201))
    collection = data(api.post("/api/v1/collections", alice_token, {
        "name": "Stage 20 Room", "slug": "stage-20-room", "member_ids": [bob["id"]],
    }, expected=201))

    cover = upload_image(api, alice_token)
    api.patch(f"/api/v1/collections/{collection['id']}", alice_token, {"cover_media_id": cover["id"]})
    api.get(cover["read_path"], bob_token)
    api.get(cover["read_path"], charlie_token, expected=404)
    checks.append("Media")

    secret = data(api.post("/api/v1/posts", alice_token, {
        "post_type": "article", "title": "Stage 20 Secret", "summary": "ACL sentinel",
        "body": "collection only", "collection_id": collection["id"],
        "category_id": category["id"], "tag_names": ["Stage 20 Tag"],
    }, expected=201))
    api.post(f"/api/v1/posts/{secret['id']}/publish", alice_token, {"slug": "stage-20-secret"})
    public = data(api.post("/api/v1/posts", alice_token, {
        "post_type": "article", "title": "Stage 20 Public", "summary": "Public acceptance",
        "body": "visible to signed-in members", "visibility": "login_only",
        "category_id": category["id"], "tag_names": ["Stage 20 Tag"],
    }, expected=201))
    api.post(f"/api/v1/posts/{public['id']}/publish", alice_token, {"slug": "stage-20-public"})
    note = data(api.post("/api/v1/posts", alice_token, {
        "post_type": "note", "body": "Stage 20 archive note", "visibility": "login_only",
    }, expected=201))
    api.post(f"/api/v1/posts/{note['id']}/publish", alice_token, {})
    private_note = data(api.post("/api/v1/posts", alice_token, {
        "post_type": "note", "body": "Stage 20 private boundary", "visibility": "private",
    }, expected=201))
    api.post(f"/api/v1/posts/{private_note['id']}/publish", alice_token, {})
    assert data(api.get(f"/api/v1/posts/{public['id']}", bob_token))["title"] == "Stage 20 Public"
    api.get(f"/api/v1/posts/{private_note['id']}", bob_token, expected=404)
    api.get(f"/api/v1/posts/{private_note['id']}", admin_token, expected=404)
    api.post(f"/api/v1/posts/{note['id']}/archive", alice_token, {})
    checks.append("Post")

    assert data(api.get("/api/v1/collections/stage-20-room", bob_token))["id"] == collection["id"]
    api.get("/api/v1/collections/stage-20-room", charlie_token, expected=404)
    assert any(item["id"] == collection["id"] for item in data(api.get("/api/v1/users/me/collections", bob_token)))
    checks.append("Collection")

    bob_search = api.get("/api/v1/search?q=Stage%2020%20Secret", bob_token)
    assert any(item["id"] == secret["id"] for item in data(bob_search)["posts"])
    charlie_search = api.get("/api/v1/search?q=Stage%2020%20Secret", charlie_token)
    assert_absent(charlie_search, "Stage 20 Secret", "ACL sentinel", "stage-20-room")
    assert data(api.get("/api/v1/search/suggestions?q=Stage%2020", charlie_token))
    checks.append("Search")

    assert any(item["id"] == category["id"] for item in data(api.get("/api/v1/categories", bob_token)))
    assert data(api.get("/api/v1/categories/stage-20-papers", bob_token))["category"]["id"] == category["id"]
    tags = data(api.get("/api/v1/admin/tags", admin_token))
    tag = next(item for item in tags if item["slug"] == "stage-20-tag")
    assert data(api.get("/api/v1/tags/stage-20-tag", charlie_token))["tag"]["id"] == tag["id"]
    checks.append("Taxonomy")

    overview = data(api.get("/api/v1/users/me/overview", alice_token))
    assert overview["counts"]["posts"] >= 4
    assert any(item["id"] == public["id"] for item in data(api.get("/api/v1/posts/me", alice_token)))
    assert data(api.get("/api/v1/users/stage20alice", bob_token))["user"]["nickname"] == "Stage 20 Alice"
    checks.append("Personal center")

    notification_total_before = api.get("/api/v1/notifications?page_size=100", alice_token)["meta"]["pagination"]["total"]
    assert data(api.get(f"/api/v1/interactions/posts/{public['id']}", bob_token)) == {
        "liked": False, "favorited": False, "like_count": 0,
    }
    assert data(api.post(f"/api/v1/interactions/posts/{public['id']}/like", bob_token, {})) == {"liked": True, "like_count": 1}
    assert data(api.post(f"/api/v1/interactions/posts/{public['id']}/like", charlie_token, {})) == {"liked": True, "like_count": 2}
    assert data(api.post(f"/api/v1/interactions/posts/{public['id']}/like", bob_token, {})) == {"liked": False, "like_count": 1}
    assert data(api.post(f"/api/v1/interactions/posts/{public['id']}/like", bob_token, {})) == {"liked": True, "like_count": 2}
    api.post(f"/api/v1/interactions/posts/{public['id']}/favorite", bob_token, {})
    api.post(f"/api/v1/interactions/posts/{secret['id']}/favorite", bob_token, {})
    favorite_ids = {item["id"] for item in data(api.get("/api/v1/interactions/favorites?page_size=100", bob_token))}
    assert {public["id"], secret["id"]} <= favorite_ids
    notification_total_after = api.get("/api/v1/notifications?page_size=100", alice_token)["meta"]["pagination"]["total"]
    assert notification_total_after == notification_total_before, "likes or favorites unexpectedly generated a notification"
    checks.append("Interactions")

    root = data(api.post("/api/v1/comments", bob_token, {"post_id": public["id"], "body": "Stage 20 root"}, expected=201))
    api.post("/api/v1/comments", alice_token, {
        "post_id": public["id"], "body": "Stage 20 reply", "reply_to_comment_id": root["id"],
    }, expected=201)
    assert data(api.get(f"/api/v1/comments?post_id={public['id']}", charlie_token))[0]["id"] == root["id"]
    assert any(item["id"] == root["id"] for item in data(api.get("/api/v1/users/me/comments", bob_token)))
    checks.append("Comments")

    bob_notices = data(api.get("/api/v1/notifications?page_size=100", bob_token))
    assert bob_notices
    unread = next((item for item in bob_notices if not item["is_read"]), None)
    if unread:
        api.post(f"/api/v1/notifications/{unread['id']}/read", bob_token, {})
    api.post("/api/v1/notifications/read-all", bob_token, {})
    assert data(api.get("/api/v1/users/me/overview", bob_token))["counts"]["unread_notifications"] == 0
    checks.append("Notifications")

    archive = data(api.get("/api/v1/archive?page=1&page_size=100", charlie_token))
    archive_ids = {item["id"] for item in archive["items"]}
    assert public["id"] in archive_ids and note["id"] in archive_ids and secret["id"] not in archive_ids
    checks.append("Archive")

    api.get("/api/v1/admin/dashboard", alice_token, expected=403)
    for path in ("users", "posts", "collections", "comments", "categories", "tags", "media", "featured", "settings", "logs"):
        api.get(f"/api/v1/admin/{path}", admin_token)
    api.get(f"/api/v1/admin/posts/{public['id']}", admin_token)
    api.post(f"/api/v1/admin/posts/{public['id']}/hide", admin_token, {"reason": "stage 20 post check"})
    api.get(f"/api/v1/posts/{public['id']}", bob_token, expected=404)
    api.post(f"/api/v1/admin/posts/{public['id']}/restore", admin_token, {"reason": "stage 20 post restore"})
    api.post(f"/api/v1/admin/comments/{root['id']}/hide", admin_token, {"reason": "stage 20 comment check"})
    api.post(f"/api/v1/admin/comments/{root['id']}/restore", admin_token, {"reason": "stage 20 comment restore"})
    api.post(f"/api/v1/admin/collections/{collection['id']}/hide", admin_token, {"reason": "stage 20 collection check"})
    api.post(f"/api/v1/admin/collections/{collection['id']}/restore", admin_token, {"reason": "stage 20 collection restore"})
    api.get(f"/api/v1/admin/media/{cover['id']}/content?thumbnail=1", admin_token)
    api.post(f"/api/v1/admin/media/{cover['id']}/hide", admin_token, {"reason": "stage 20 media check"})
    api.get(cover["read_path"], bob_token, expected=404)
    api.post(f"/api/v1/admin/media/{cover['id']}/restore", admin_token, {"reason": "stage 20 media restore"})
    featured = data(api.post("/api/v1/admin/featured", admin_token, {
        "content_type": "article", "post_id": public["id"], "sort_order": 1,
        "reason": "stage 20 featured check",
    }, expected=201))
    assert any(item["id"] == public["id"] for item in data(api.get("/api/v1/home", charlie_token))["featured_articles"])
    api.patch(f"/api/v1/admin/featured/{featured['id']}", admin_token, {"sort_order": 2, "reason": "stage 20 reorder"})
    api.put("/api/v1/admin/settings", admin_token, {
        "settings": {"site_name": "映墨 Stage 20"}, "reason": "stage 20 settings check",
    })
    api.post("/api/v1/admin/notifications", admin_token, {
        "message": "Stage 20 system notice", "user_ids": [charlie["id"]], "reason": "stage 20 notice check",
    }, expected=201)
    assert any(item["message"] == "Stage 20 system notice" for item in data(api.get("/api/v1/notifications", charlie_token)))
    api.patch(f"/api/v1/categories/{category['id']}", admin_token, {"is_active": False, "reason": "stage 20 category check"})
    api.patch(f"/api/v1/categories/{category['id']}", admin_token, {"is_active": True, "reason": "stage 20 category restore"})
    api.patch(f"/api/v1/tags/{tag['id']}", admin_token, {"is_active": False, "reason": "stage 20 tag check"})
    api.patch(f"/api/v1/tags/{tag['id']}", admin_token, {"is_active": True, "reason": "stage 20 tag restore"})
    actions = {item["action"] for item in data(api.get("/api/v1/admin/logs?page_size=100", admin_token))}
    assert {"post.hide", "post.restore", "media.hide", "media.restore", "featured.create", "settings.update", "notification.send"} <= actions
    checks.append("Admin full surface")

    api.put(f"/api/v1/collections/{collection['id']}/members", alice_token, {"member_ids": []})
    api.get(f"/api/v1/posts/{secret['id']}", bob_token, expected=404)
    api.get("/api/v1/collections/stage-20-room", bob_token, expected=404)
    visible_favorites = api.get("/api/v1/interactions/favorites?page=1&page_size=100", bob_token)
    assert secret["id"] not in {item["id"] for item in data(visible_favorites)}
    assert_absent(visible_favorites, "Stage 20 Secret", "ACL sentinel", "stage-20-room")
    leaked_search = api.get("/api/v1/search?q=Stage%2020%20Secret", bob_token)
    assert_absent(leaked_search, "Stage 20 Secret", "ACL sentinel", "stage-20-room")
    sanitized_notices = api.get("/api/v1/notifications?page_size=100", bob_token)
    for item in data(sanitized_notices):
        if "Stage 20 Room" in item["message"]:
            assert item["target_url"] is None
    checks.append("ACL revocation")

    print("FULL_HTTP_VERIFY_OK " + ", ".join(checks))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:18200")
    run(parser.parse_args().base_url)
