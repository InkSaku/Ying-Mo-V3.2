import re

import pytest

from .conftest import auth, register, token_from


def test_username_profile_rules_and_session_revocation(client):
    response=register(client,"Alice-X",nickname="爱丽丝")
    assert response.status_code==201
    token=token_from(response)
    assert response.get_json()["data"]["user"]["username"]=="alice-x"

    immutable=client.patch("/api/v1/users/me",headers=auth(token),json={"username":"changed"})
    assert immutable.status_code==422
    assert register(client,"alice-x",email="other@example.com").status_code==409

    sessions=client.get("/api/v1/auth/sessions",headers=auth(token))
    assert sessions.status_code==200
    current=next(item for item in sessions.get_json()["data"] if item["current"])
    revoked=client.delete(f"/api/v1/auth/sessions/{current['id']}",headers=auth(token))
    assert revoked.status_code==200
    blocked=client.get("/api/v1/auth/me",headers=auth(token))
    assert blocked.status_code==401
    assert blocked.get_json()["error"]["code"]=="TOKEN_REVOKED"


def test_refresh_rotates_session_and_invalidates_old_access(client):
    registered=register(client,"alice")
    old_access=token_from(registered)
    refreshed=client.post("/api/v1/auth/refresh")
    assert refreshed.status_code==200,refreshed.get_json()
    new_access=refreshed.get_json()["data"]["access_token"]
    assert new_access!=old_access
    assert client.get("/api/v1/auth/me",headers=auth(old_access)).status_code==401
    assert client.get("/api/v1/auth/me",headers=auth(new_access)).status_code==200
    assert client.post("/api/v1/auth/logout-all",headers=auth(new_access)).status_code==200
    assert client.get("/api/v1/auth/me",headers=auth(new_access)).status_code==401


@pytest.mark.parametrize("path",[
    "/api/v1/home","/api/v1/posts","/api/v1/collections","/api/v1/archive",
    "/api/v1/search?q=x","/api/v1/categories","/api/v1/tags",
    "/api/v1/users/alice","/api/v1/comments?post_id=1",
    "/api/v1/interactions/posts/1","/api/v1/uploads/images/unknown",
    "/api/v1/notifications","/api/v1/admin/dashboard",
])
def test_every_content_json_surface_requires_authentication(client,path):
    response=client.get(path)
    assert response.status_code==401
    assert response.get_json()["error"]["code"]=="AUTHENTICATION_REQUIRED"


def test_spa_shell_sitemap_rss_and_retired_routes_do_not_leak(client):
    for path in ("/articles/secret-title","/notes/42","/collections/private-trip","/users/alice","/archive/2026","/search"):
        response=client.get(path)
        assert response.status_code==200
        text=response.get_data(as_text=True)
        assert "noindex,nofollow" in text
        assert "secret-title" not in text
        assert response.headers["Cache-Control"]=="private, no-store"
    sitemap=client.get("/sitemap.xml").get_data(as_text=True)
    assert "/about" in sitemap
    assert not re.search(r"/(?:articles|notes|collections|users)/",sitemap)
    assert client.get("/rss.xml").status_code==404
    assert client.get("/life/post/1").status_code==404
    assert client.get("/games/overwatch").status_code==404
    assert client.get("/guide/1").status_code==404


def test_markdown_detail_is_sanitized(client):
    registered=register(client,"alice"); token=token_from(registered)
    created=client.post("/api/v1/posts",headers=auth(token),json={
        "post_type":"article","title":"Safe","body":"# Heading\n<script>alert(1)</script>\n[bad](javascript:alert(2))",
    })
    post_id=created.get_json()["data"]["id"]
    assert client.post(f"/api/v1/posts/{post_id}/publish",headers=auth(token),json={"slug":"safe"}).status_code==200
    html=client.get(f"/api/v1/posts/{post_id}",headers=auth(token)).get_json()["data"]["rendered_html"]
    assert "<script" not in html
    assert "javascript:" not in html
    assert 'id="heading"' in html
