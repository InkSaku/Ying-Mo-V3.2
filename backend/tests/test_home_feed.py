from datetime import date, datetime, timezone

from app.extensions import db
from app.models import Post, PostStatus

from .conftest import auth, register, token_from


def publish(client, token, payload, *, slug=None):
    created = client.post("/api/v1/posts", headers=auth(token), json=payload)
    assert created.status_code == 201, created.get_json()
    post = created.get_json()["data"]
    response = client.post(
        f"/api/v1/posts/{post['id']}/publish",
        headers=auth(token),
        json={"slug": slug} if slug else {},
    )
    assert response.status_code == 200, response.get_json()
    return response.get_json()["data"]


def set_post_times(app, values):
    with app.app_context():
        for post_id, published_at, occurred_at in values:
            post = db.session.get(Post, post_id)
            post.published_at = published_at
            post.occurred_at = occurred_at
        db.session.commit()


def test_home_feed_is_acl_safe_semantic_and_cursor_paginated(client, app):
    alice_response = register(client, "feedalice", nickname="Alice")
    bob_response = register(client, "feedbob", nickname="Bob")
    alice_token = token_from(alice_response)
    bob_token = token_from(bob_response)
    bob = bob_response.get_json()["data"]["user"]

    collection = client.post("/api/v1/collections", headers=auth(alice_token), json={
        "name": "共同日子", "slug": "shared-feed", "member_ids": [bob["id"]],
    }).get_json()["data"]
    note_recent = publish(client, alice_token, {
        "post_type": "note", "body": "最近发生的随记", "collection_id": collection["id"],
    })
    article = publish(client, alice_token, {
        "post_type": "article", "title": "中间的文章", "body": "正文", "visibility": "login_only",
    }, slug="middle-feed-article")
    note_old = publish(client, alice_token, {
        "post_type": "note", "body": "更早的随记", "visibility": "login_only",
    })
    private_post = publish(client, alice_token, {
        "post_type": "note", "body": "Alice 私密", "visibility": "private",
    })
    bob_private = publish(client, bob_token, {
        "post_type": "note", "body": "Bob 私密", "visibility": "private",
    })

    set_post_times(app, [
        (note_recent["id"], datetime(2026, 8, 1, tzinfo=timezone.utc), datetime(2026, 8, 25, tzinfo=timezone.utc)),
        (article["id"], datetime(2026, 8, 20, tzinfo=timezone.utc), None),
        (note_old["id"], datetime(2026, 8, 24, tzinfo=timezone.utc), datetime(2026, 8, 10, tzinfo=timezone.utc)),
        (private_post["id"], datetime(2026, 8, 30, tzinfo=timezone.utc), datetime(2026, 8, 30, tzinfo=timezone.utc)),
        (bob_private["id"], datetime(2026, 8, 15, tzinfo=timezone.utc), datetime(2026, 8, 15, tzinfo=timezone.utc)),
    ])

    first = client.get("/api/v1/home/feed?page_size=2", headers=auth(bob_token))
    assert first.status_code == 200
    first_data = first.get_json()["data"]
    assert [item["id"] for item in first_data["items"]] == [note_recent["id"], article["id"]]
    assert first_data["items"][0]["feed_excerpt"] == "最近发生的随记"
    assert first_data["items"][1]["feed_excerpt"] == "正文"
    assert first_data["has_more"] is True
    assert first_data["next_cursor"]

    second = client.get(
        f"/api/v1/home/feed?page_size=2&cursor={first_data['next_cursor']}",
        headers=auth(bob_token),
    )
    assert second.status_code == 200
    second_data = second.get_json()["data"]
    assert [item["id"] for item in second_data["items"]] == [bob_private["id"], note_old["id"]]
    returned = {item["id"] for item in first_data["items"] + second_data["items"]}
    assert private_post["id"] not in returned


def test_home_feed_type_filter_cursor_binding_and_validation(client, app):
    response = register(client, "feedfilter", nickname="筛选成员")
    token = token_from(response)
    note = publish(client, token, {
        "post_type": "note", "body": "筛选随记", "visibility": "private",
    })
    article = publish(client, token, {
        "post_type": "article", "title": "筛选文章", "body": "正文", "visibility": "private",
    }, slug="filtered-feed-article")
    archived = publish(client, token, {
        "post_type": "note", "body": "归档随记", "visibility": "private",
    })
    with app.app_context():
        db.session.get(Post, archived["id"]).status = PostStatus.ARCHIVED.value
        db.session.commit()

    notes = client.get("/api/v1/home/feed?type=note&page_size=1", headers=auth(token))
    assert notes.status_code == 200
    notes_data = notes.get_json()["data"]
    assert [item["id"] for item in notes_data["items"]] == [note["id"]]
    assert notes_data["has_more"] is False

    all_feed = client.get("/api/v1/home/feed?page_size=1", headers=auth(token)).get_json()["data"]
    mismatched = client.get(
        f"/api/v1/home/feed?type=article&cursor={all_feed['next_cursor']}",
        headers=auth(token),
    )
    assert mismatched.status_code == 422
    assert client.get("/api/v1/home/feed?type=unknown", headers=auth(token)).status_code == 422
    assert client.get("/api/v1/home/feed?page_size=31", headers=auth(token)).status_code == 422
    assert client.get("/api/v1/home/feed?cursor=broken", headers=auth(token)).status_code == 422
    articles = client.get("/api/v1/home/feed?type=article", headers=auth(token)).get_json()["data"]
    assert [item["id"] for item in articles["items"]] == [article["id"]]


def test_home_feed_interleaves_acl_safe_memories_once(client, app, monkeypatch):
    response = register(client, "feedmemory", nickname="回忆成员")
    other_response = register(client, "feedmemoryother", nickname="另一位成员")
    token = token_from(response)
    other_token = token_from(other_response)
    monkeypatch.setattr("app.home.on_this_day.utc_today", lambda: date(2026, 8, 25))

    current = publish(client, token, {
        "post_type": "note", "body": "今天的新记录", "visibility": "private",
    })
    published_memory = publish(client, token, {
        "post_type": "note", "body": "两年前的今天", "visibility": "private",
    })
    archived_memory = publish(client, token, {
        "post_type": "article", "title": "三年前的今天", "body": "旧文章", "visibility": "private",
    }, slug="memory-three-years-ago")
    ordinary_old_post = publish(client, token, {
        "post_type": "note", "body": "不是同一天", "visibility": "private",
    })
    hidden_memory = publish(client, other_token, {
        "post_type": "note", "body": "无权读取的回忆", "visibility": "private",
    })
    set_post_times(app, [
        (current["id"], datetime(2026, 8, 25, 12, tzinfo=timezone.utc), datetime(2026, 8, 25, 12, tzinfo=timezone.utc)),
        (published_memory["id"], datetime(2024, 8, 25, 12, tzinfo=timezone.utc), datetime(2024, 8, 25, 12, tzinfo=timezone.utc)),
        (archived_memory["id"], datetime(2023, 8, 25, 12, tzinfo=timezone.utc), datetime(2023, 8, 25, 12, tzinfo=timezone.utc)),
        (ordinary_old_post["id"], datetime(2022, 8, 24, 12, tzinfo=timezone.utc), datetime(2022, 8, 24, 12, tzinfo=timezone.utc)),
        (hidden_memory["id"], datetime(2025, 8, 25, 12, tzinfo=timezone.utc), datetime(2025, 8, 25, 12, tzinfo=timezone.utc)),
    ])
    with app.app_context():
        db.session.get(Post, archived_memory["id"]).status = PostStatus.ARCHIVED.value
        db.session.commit()

    first = client.get("/api/v1/home/feed?page_size=1", headers=auth(token)).get_json()["data"]
    assert [item["id"] for item in first["items"]] == [current["id"]]
    assert first["memory_interlude"]["date"] == "2026-08-25"
    assert first["memory_interlude"]["total"] == 2
    assert [item["id"] for item in first["memory_interlude"]["items"]] == [
        published_memory["id"], archived_memory["id"],
    ]
    assert hidden_memory["id"] not in {item["id"] for item in first["memory_interlude"]["items"]}

    second = client.get(
        f"/api/v1/home/feed?page_size=2&cursor={first['next_cursor']}",
        headers=auth(token),
    ).get_json()["data"]
    assert [item["id"] for item in second["items"]] == [ordinary_old_post["id"]]
    assert second["has_more"] is False
    assert second["memory_interlude"] is None

    note_feed = client.get("/api/v1/home/feed?type=note", headers=auth(token)).get_json()["data"]
    assert note_feed["memory_interlude"] is None
