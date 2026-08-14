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


def test_profile_has_independent_pagination_and_never_exposes_self_only_fields(client):
    alice_response=register(client,"alice",nickname="Alice")
    bob_response=register(client,"bob",nickname="Bob")
    charlie_response=register(client,"charlie",nickname="Charlie")
    alice=alice_response.get_json()["data"]["user"]
    bob=bob_response.get_json()["data"]["user"]
    charlie=charlie_response.get_json()["data"]["user"]
    alice_token=token_from(alice_response)
    bob_token=token_from(bob_response)

    shared=[]
    for index in range(2):
        response=client.post("/api/v1/collections",headers=auth(alice_token),json={
            "name":f"Shared {index}","slug":f"shared-{index}","member_ids":[bob["id"]],
        })
        shared.append(response.get_json()["data"])
    hidden_collection=client.post("/api/v1/collections",headers=auth(alice_token),json={
        "name":"Hidden Circle","slug":"hidden-circle","member_ids":[charlie["id"]],
    }).get_json()["data"]

    def publish_note(body,**extra):
        created=client.post("/api/v1/posts",headers=auth(alice_token),json={
            "post_type":"note","body":body,**extra,
        }).get_json()["data"]
        client.post(f"/api/v1/posts/{created['id']}/publish",headers=auth(alice_token),json={})
        return created

    publish_note("Public one",visibility="login_only")
    publish_note("Public two",collection_id=shared[0]["id"])
    publish_note("Hidden collection post",collection_id=hidden_collection["id"])
    publish_note("Private profile leak",visibility="private")

    page_two=client.get(
        "/api/v1/users/alice?posts_page=2&collections_page=2&page_size=1",
        headers=auth(bob_token),
    )
    assert page_two.status_code==200
    payload=page_two.get_json()
    assert payload["data"]["visible_post_count"]==2
    assert payload["data"]["visible_collection_count"]==2
    assert len(payload["data"]["posts"])==1
    assert len(payload["data"]["collections"])==1
    assert payload["meta"]["posts_pagination"]["total_pages"]==2
    assert payload["meta"]["collections_pagination"]["total_pages"]==2
    assert {"email","role","status","last_login_at"}.isdisjoint(payload["data"]["user"])
    assert "Private profile leak" not in str(payload)
    assert "Hidden Circle" not in str(payload)

    own_profile=client.get("/api/v1/users/alice?page_size=50",headers=auth(alice_token))
    assert own_profile.status_code==200
    assert own_profile.get_json()["data"]["visible_post_count"]==3
    assert "Private profile leak" not in str(own_profile.get_json())
    assert client.get("/api/v1/users/alice?posts_page=0",headers=auth(bob_token)).status_code==422


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
    "/api/v1/search?q=x","/api/v1/categories","/api/v1/categories/options","/api/v1/tags",
    "/api/v1/users/alice","/api/v1/comments?post_id=1",
    "/api/v1/interactions/posts/1","/api/v1/uploads/images/unknown",
    "/api/v1/notifications","/api/v1/admin/dashboard",
])
def test_every_content_json_surface_requires_authentication(client,path):
    response=client.get(path)
    assert response.status_code==401
    assert response.get_json()["error"]["code"]=="AUTHENTICATION_REQUIRED"


def test_spa_shell_sitemap_rss_and_retired_routes_do_not_leak(client):
    for path in (
        "/articles/secret-title","/notes/42","/collections/private-trip","/users/alice",
        "/archive/2026","/categories","/tags","/search",
    ):
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
