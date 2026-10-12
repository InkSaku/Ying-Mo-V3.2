from datetime import datetime, timezone

from app.extensions import db
from app.models import Post, Tag
from .conftest import auth, register, token_from


def test_options_rank_top_ten_and_search_beyond_the_top_ten(app, client):
    response = register(client, "tagoptions")
    user_id = response.get_json()["data"]["user"]["id"]
    headers = auth(token_from(response))
    with app.app_context():
        for index in range(12):
            tag = Tag(name=f"主题 {index:02}", name_normalized=f"主题 {index:02}", slug=f"topic-{index}")
            db.session.add(tag)
            for _ in range(12 - index):
                db.session.add(Post(author_id=user_id, post_type="note", body="记录", status="published", visibility="login_only", published_at=datetime.now(timezone.utc), tags=[tag]))
        db.session.commit()
    items = client.get("/api/v1/tags/options/search", headers=headers).get_json()["data"]
    assert len(items) == 10
    assert [item["visible_post_count"] for item in items] == list(range(12, 2, -1))
    result = client.get("/api/v1/tags/options/search?q=主题%2011&limit=20", headers=headers).get_json()["data"]
    assert [(item["name"], item["visible_post_count"]) for item in result] == [("主题 11", 1)]


def test_options_hide_other_private_content_but_include_own_draft_tags(app, client):
    alice = register(client, "tagalice")
    bob = register(client, "tagbob")
    alice_id = alice.get_json()["data"]["user"]["id"]
    bob_id = bob.get_json()["data"]["user"]["id"]
    with app.app_context():
        shared = Tag(name="Python", name_normalized="python", slug="python")
        hidden = Tag(name="秘密", name_normalized="秘密", slug="secret")
        draft = Tag(name="待写", name_normalized="待写", slug="draft-tag")
        db.session.add_all([
            Post(author_id=alice_id, post_type="note", body="分享", status="published", visibility="login_only", published_at=datetime.now(timezone.utc), tags=[shared]),
            Post(author_id=alice_id, post_type="note", body="私密", status="published", visibility="private", published_at=datetime.now(timezone.utc), tags=[shared, hidden]),
            Post(author_id=bob_id, post_type="note", body="草稿", status="draft", visibility="private", tags=[draft]),
        ])
        db.session.commit()
    headers = auth(token_from(bob))
    items = client.get("/api/v1/tags/options/search", headers=headers).get_json()["data"]
    assert {item["name"]: item["visible_post_count"] for item in items} == {"Python": 1, "待写": 0}
    assert client.get("/api/v1/tags/options/search?q=秘密", headers=headers).get_json()["data"] == []
    assert client.get("/api/v1/tags/options/search?q=%20PYTHON%20", headers=headers).get_json()["data"][0]["name"] == "Python"


def test_tag_creation_reuses_normalized_names_and_rejects_long_names(client):
    response = register(client, "tagreuse")
    headers = auth(token_from(response))
    first = client.post("/api/v1/posts", headers=headers, json={"post_type": "note", "body": "一", "tag_names": ["Python", "python"]})
    assert first.status_code == 201
    second = client.post("/api/v1/posts", headers=headers, json={"post_type": "note", "body": "二", "tag_names": [" PYTHON "]})
    assert first.get_json()["data"]["tags"][0]["id"] == second.get_json()["data"]["tags"][0]["id"]
    assert len(first.get_json()["data"]["tags"]) == 1
    assert client.post("/api/v1/posts", headers=headers, json={"post_type": "note", "tag_names": ["长" * 81]}).status_code == 422
    assert client.get("/api/v1/tags/options/search?limit=500", headers=headers).status_code == 422
    assert client.get("/api/v1/tags/options/search?q=%25", headers=headers).get_json()["data"] == []


def test_tag_partition_filters_types_without_hiding_empty_filter_results(client):
    response = register(client, "tagfilters")
    headers = auth(token_from(response))
    for kind, names in [("article", ["Mixed", "Solo"]), ("note", ["Mixed"])]:
        draft = client.post("/api/v1/posts", headers=headers, json={
            "post_type": kind, "title": "记录", "body": "正文", "tag_names": names, "visibility": "login_only",
        }).get_json()["data"]
        published = client.post(f"/api/v1/posts/{draft['id']}/publish", headers=headers, json={"slug": "tag-filter-article"} if kind == "article" else {})
        assert published.status_code == 200
    response = client.get("/api/v1/tags/mixed?post_type=note", headers=headers)
    assert response.status_code == 200
    data = response.get_json()
    assert data["data"]["visible_post_count"] == 2
    assert data["meta"]["pagination"]["total"] == 1
    assert [post["post_type"] for post in data["data"]["posts"]] == ["note"]
    empty = client.get("/api/v1/tags/solo?post_type=note", headers=headers)
    assert empty.status_code == 200
    assert empty.get_json()["data"]["posts"] == []
    assert client.get("/api/v1/tags/mixed?post_type=unknown", headers=headers).status_code == 422


def test_inactive_existing_name_is_identified_but_not_recommended(app, client):
    response = register(client, "taginactive")
    headers = auth(token_from(response))
    post = client.post("/api/v1/posts", headers=headers, json={"post_type": "note", "body": "原记录", "tag_names": ["旧词"]}).get_json()["data"]
    with app.app_context():
        tag = db.session.get(Tag, post["tags"][0]["id"])
        tag.is_active = False
        db.session.commit()
    assert client.get("/api/v1/tags/options/search", headers=headers).get_json()["data"] == []
    items = client.get("/api/v1/tags/options/search?q=旧词", headers=headers).get_json()["data"]
    assert len(items) == 1
    assert items[0]["is_active"] is False
    assert items[0]["visible_post_count"] == 0


def test_options_search_does_not_shadow_a_tag_named_options(client):
    response = register(client, "tagendpoint")
    headers = auth(token_from(response))
    draft = client.post("/api/v1/posts", headers=headers, json={"post_type": "note", "body": "配置选项", "tag_names": ["options"]}).get_json()["data"]
    assert client.post(f"/api/v1/posts/{draft['id']}/publish", headers=headers, json={}).status_code == 200
    detail = client.get("/api/v1/tags/options", headers=headers)
    assert detail.status_code == 200
    assert detail.get_json()["data"]["tag"]["name"] == "options"
    choices = client.get("/api/v1/tags/options/search?q=options", headers=headers)
    assert choices.status_code == 200
    assert choices.get_json()["data"][0]["name"] == "options"
