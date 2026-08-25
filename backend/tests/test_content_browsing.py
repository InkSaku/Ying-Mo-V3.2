from app.extensions import db
from datetime import datetime, timezone

from app.models import Category, Media, Post, PostModerationStatus

from .conftest import auth, register, token_from


def publish(client, token, payload, *, slug=None):
    created = client.post("/api/v1/posts", headers=auth(token), json=payload)
    assert created.status_code == 201, created.get_json()
    post = created.get_json()["data"]
    published = client.post(
        f"/api/v1/posts/{post['id']}/publish",
        headers=auth(token),
        json={"slug": slug} if slug else {},
    )
    assert published.status_code == 200, published.get_json()
    return published.get_json()["data"]


def test_browse_filters_cards_and_detail_metadata(client, app):
    alice_response = register(client, "browsealice", nickname="Alice")
    bob_response = register(client, "browsebob", nickname="Bob")
    alice = alice_response.get_json()["data"]["user"]
    bob = bob_response.get_json()["data"]["user"]
    alice_token = token_from(alice_response)
    bob_token = token_from(bob_response)

    collection = client.post("/api/v1/collections", headers=auth(alice_token), json={
        "name": "Tokyo 2026", "slug": "tokyo-2026", "member_ids": [bob["id"]],
    }).get_json()["data"]
    with app.app_context():
        category = Category(name="旅行", name_normalized="旅行", slug="travel")
        db.session.add(category)
        db.session.commit()
        category_id = category.id

    article = publish(client, alice_token, {
        "post_type": "article",
        "title": "东京旅行",
        "summary": "七日旅行记录",
        "body": "旅" * 601,
        "visibility": "login_only",
        "category_id": category_id,
        "tag_names": ["Japan"],
    }, slug="tokyo-article")
    note = publish(client, alice_token, {
        "post_type": "note",
        "title": "东京塔夜景",
        "body": "第一次看到东京塔亮灯",
        "occurred_at": "2025-08-10T12:00:00Z",
        "location": "东京",
        "mood": "开心",
        "tag_names": ["Travel"],
        "collection_id": collection["id"],
    })
    with app.app_context():
        media = Media(
            owner_id=alice["id"], kind="live_photo_image", mime_type="image/jpeg",
            byte_size=128, width=1200, height=800, storage_key="browse/tokyo.jpg",
            thumbnail_key="browse/tokyo.webp", live_photo_pair_id="pair-tokyo",
            bound_type="post", bound_id=note["id"],
        )
        db.session.add(media)
        db.session.commit()
        media_public_id = media.public_id

    articles = client.get(
        "/api/v1/posts?post_type=article&author=browsealice&category=travel&tag=japan&sort=newest",
        headers=auth(bob_token),
    )
    assert articles.status_code == 200
    article_card = articles.get_json()["data"][0]
    assert article_card["id"] == article["id"]
    assert article_card["content_excerpt"] == "七日旅行记录"
    assert article_card["reading_minutes"] == 3
    assert article_card["category"]["slug"] == "travel"

    notes = client.get(
        "/api/v1/posts?post_type=note&author=browsealice&tag=travel&collection=tokyo-2026",
        headers=auth(bob_token),
    )
    assert notes.status_code == 200
    note_card = notes.get_json()["data"][0]
    assert note_card["id"] == note["id"]
    assert note_card["content_excerpt"] == "第一次看到东京塔亮灯"
    assert "body" not in note_card
    assert note_card["display_media"]["public_id"] == media_public_id
    assert note_card["collection"]["slug"] == "tokyo-2026"
    assert note_card["semantic_time"].startswith("2025-08-10")

    note_options = client.get(
        "/api/v1/posts/filter-options?post_type=note", headers=auth(bob_token)
    ).get_json()["data"]
    assert [item["username"] for item in note_options["authors"]] == ["browsealice"]
    assert note_options["categories"] == []
    assert [item["slug"] for item in note_options["tags"]] == ["travel"]
    assert [item["slug"] for item in note_options["collections"]] == ["tokyo-2026"]

    detail = client.get(f"/api/v1/posts/{article['id']}", headers=auth(bob_token)).get_json()["data"]
    assert detail["reading_minutes"] == 3
    assert detail["published_at"] and detail["updated_at"]

    archive = client.get(
        "/api/v1/archive/2025?author=browsealice&tag=travel&collection=tokyo-2026",
        headers=auth(bob_token),
    ).get_json()["data"]
    assert [item["id"] for item in archive["items"]] == [note["id"]]
    assert archive["items"][0]["display_media"]["public_id"] == media_public_id
    assert archive["items"][0]["collection"]["slug"] == "tokyo-2026"


def test_note_experience_uses_nearby_collection_posts_without_leaking_body(client, app):
    alice_response = register(client, "experiencealice", nickname="Alice")
    bob_response = register(client, "experiencebob", nickname="Bob")
    alice = alice_response.get_json()["data"]["user"]
    bob = bob_response.get_json()["data"]["user"]
    alice_token = token_from(alice_response)
    bob_token = token_from(bob_response)

    collection = client.post("/api/v1/collections", headers=auth(alice_token), json={
        "name": "海边周末",
        "slug": "seaside-weekend",
        "description": "朋友们从不同视角留下的海边记录。",
        "member_ids": [bob["id"]],
    }).get_json()["data"]
    older_note = publish(client, bob_token, {
        "post_type": "note", "body": "出发前在车站买了热咖啡。",
        "occurred_at": "2025-08-09T08:00:00Z", "collection_id": collection["id"],
    })
    current_note = publish(client, alice_token, {
        "post_type": "note", "body": "傍晚一起走到了海边。",
        "occurred_at": "2025-08-10T18:00:00Z", "collection_id": collection["id"],
    })
    later_article = publish(client, bob_token, {
        "post_type": "article", "title": "海边的两天", "body": "完整文章正文",
        "collection_id": collection["id"],
    }, slug="seaside-two-days")
    hidden_note = publish(client, alice_token, {
        "post_type": "note", "body": "不应出现的隐藏记录",
        "occurred_at": "2025-08-10T19:00:00Z", "collection_id": collection["id"],
    })
    independent_note = publish(client, alice_token, {
        "post_type": "note", "body": "一条独立记录", "visibility": "login_only",
    })
    draft = client.post("/api/v1/posts", headers=auth(alice_token), json={
        "post_type": "note", "body": "不应出现的草稿", "collection_id": collection["id"],
    }).get_json()["data"]

    with app.app_context():
        db.session.get(Post, later_article["id"]).published_at = datetime(2025, 8, 11, 12, tzinfo=timezone.utc)
        db.session.get(Post, hidden_note["id"]).moderation_status = PostModerationStatus.HIDDEN.value
        media = Media(
            owner_id=bob["id"], kind="image", mime_type="image/jpeg", byte_size=128,
            width=1200, height=800, storage_key="experience/station.jpg",
            thumbnail_key="experience/station.webp", bound_type="post", bound_id=older_note["id"],
        )
        db.session.add(media)
        db.session.commit()
        media_public_id = media.public_id

    response = client.get(f"/api/v1/posts/{current_note['id']}", headers=auth(bob_token))
    assert response.status_code == 200
    experience = response.get_json()["data"]["experience"]
    assert experience["collection"] == {
        "id": collection["id"],
        "name": "海边周末",
        "slug": "seaside-weekend",
        "description": "朋友们从不同视角留下的海边记录。",
        "cover_media": None,
    }
    assert [item["id"] for item in experience["items"]] == [older_note["id"], later_article["id"]]
    assert [item["experience_position"] for item in experience["items"]] == ["before", "after"]
    assert experience["items"][0]["display_media"]["public_id"] == media_public_id
    assert experience["items"][1]["slug"] == "seaside-two-days"
    assert all("body" not in item for item in experience["items"])
    assert hidden_note["id"] not in {item["id"] for item in experience["items"]}
    assert draft["id"] not in {item["id"] for item in experience["items"]}

    independent = client.get(f"/api/v1/posts/{independent_note['id']}", headers=auth(bob_token))
    assert independent.status_code == 200
    assert independent.get_json()["data"]["experience"] is None


def test_related_articles_are_acl_safe_scored_explainable_and_capped(client, app):
    alice_response = register(client, "relatedalice", nickname="Alice")
    bob_response = register(client, "relatedbob", nickname="Bob")
    charlie_response = register(client, "relatedcharlie", nickname="Charlie")
    alice = alice_response.get_json()["data"]["user"]
    bob = bob_response.get_json()["data"]["user"]
    alice_token = token_from(alice_response)
    bob_token = token_from(bob_response)
    charlie_token = token_from(charlie_response)

    shared_collection = client.post("/api/v1/collections", headers=auth(alice_token), json={
        "name": "共同旅行", "slug": "shared-travel", "member_ids": [bob["id"]],
    }).get_json()["data"]
    private_collection = client.post("/api/v1/collections", headers=auth(charlie_token), json={
        "name": "不可见合集", "slug": "private-related", "member_ids": [],
    }).get_json()["data"]
    with app.app_context():
        category = Category(name="旅行", name_normalized="旅行", slug="related-travel")
        db.session.add(category)
        db.session.commit()
        category_id = category.id

    current = publish(client, alice_token, {
        "post_type": "article", "title": "当前文章", "body": "正文",
        "category_id": category_id, "tag_names": ["日本", "美食"],
        "collection_id": shared_collection["id"],
    }, slug="related-current")
    same_collection = publish(client, alice_token, {
        "post_type": "article", "title": "同合集", "body": "正文",
        "collection_id": shared_collection["id"],
    }, slug="related-collection")
    category_two_tags = publish(client, bob_token, {
        "post_type": "article", "title": "分类与双标签", "body": "正文",
        "visibility": "login_only", "category_id": category_id,
        "tag_names": ["日本", "美食"],
    }, slug="related-category-two-tags")
    same_author_category_tag = publish(client, alice_token, {
        "post_type": "article", "title": "同作者分类标签", "body": "正文",
        "visibility": "login_only", "category_id": category_id, "tag_names": ["日本"],
    }, slug="related-author-category-tag")
    older_category_only = publish(client, bob_token, {
        "post_type": "article", "title": "较早的仅分类", "body": "正文",
        "visibility": "login_only", "category_id": category_id,
    }, slug="related-older-category-only")
    category_only = publish(client, bob_token, {
        "post_type": "article", "title": "仅分类", "body": "正文",
        "visibility": "login_only", "category_id": category_id,
    }, slug="related-category-only")
    publish(client, bob_token, {
        "post_type": "article", "title": "仅标签且超出上限", "body": "正文",
        "visibility": "login_only", "tag_names": ["日本"],
    }, slug="related-tag-only")
    publish(client, alice_token, {
        "post_type": "article", "title": "只有同作者", "body": "正文",
        "visibility": "login_only", "tag_names": ["无关标签"],
    }, slug="related-author-only")
    inaccessible = publish(client, charlie_token, {
        "post_type": "article", "title": "不可见但高相关", "body": "正文",
        "category_id": category_id, "tag_names": ["日本", "美食"],
        "collection_id": private_collection["id"],
    }, slug="related-inaccessible")
    hidden = publish(client, alice_token, {
        "post_type": "article", "title": "隐藏同合集", "body": "正文",
        "collection_id": shared_collection["id"],
    }, slug="related-hidden")
    deleted = publish(client, alice_token, {
        "post_type": "article", "title": "删除同合集", "body": "正文",
        "collection_id": shared_collection["id"],
    }, slug="related-deleted")
    draft_response = client.post("/api/v1/posts", headers=auth(alice_token), json={
        "post_type": "article", "title": "草稿同合集", "body": "正文",
        "collection_id": shared_collection["id"],
    })
    assert draft_response.status_code == 201

    with app.app_context():
        db.session.get(Post, hidden["id"]).moderation_status = PostModerationStatus.HIDDEN.value
        db.session.get(Post, deleted["id"]).deleted_at = datetime.now(timezone.utc)
        db.session.commit()

    response = client.get(f"/api/v1/posts/{current['id']}", headers=auth(bob_token))
    assert response.status_code == 200
    related = response.get_json()["data"]["related"]
    assert [item["id"] for item in related] == [
        same_collection["id"],
        category_two_tags["id"],
        same_author_category_tag["id"],
        category_only["id"],
    ]
    assert related[0]["related_reasons"] == ["同属「共同旅行」合集", "同一作者"]
    assert related[1]["related_reasons"] == ["同属旅行分类", "共同标签：日本、美食"]
    assert related[2]["related_reasons"] == ["同属旅行分类", "共同标签：日本", "同一作者"]
    returned_ids = {item["id"] for item in related}
    assert inaccessible["id"] not in returned_ids
    assert hidden["id"] not in returned_ids
    assert deleted["id"] not in returned_ids
    assert older_category_only["id"] not in returned_ids
