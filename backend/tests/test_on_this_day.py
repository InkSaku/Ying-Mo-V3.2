from datetime import date, datetime, timezone

import app.home.on_this_day as on_this_day_module
from app.extensions import db
from app.models import Post

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


def test_on_this_day_uses_semantic_time_acl_archives_and_pagination(client, app, monkeypatch):
    monkeypatch.setattr(on_this_day_module, "utc_today", lambda: date(2026, 8, 21))
    alice_response = register(client, "memoryalice", nickname="Alice")
    bob_response = register(client, "memorybob", nickname="Bob")
    charlie_response = register(client, "memorycharlie", nickname="Charlie")
    alice = alice_response.get_json()["data"]["user"]
    bob = bob_response.get_json()["data"]["user"]
    alice_token = token_from(alice_response)
    bob_token = token_from(bob_response)
    charlie_token = token_from(charlie_response)

    collection = client.post("/api/v1/collections", headers=auth(alice_token), json={
        "name": "Shared memories", "slug": "shared-memories", "member_ids": [bob["id"]],
    }).get_json()["data"]
    article = publish(client, alice_token, {
        "post_type": "article", "title": "Two years ago", "body": "Article",
        "visibility": "login_only",
    }, slug="two-years-ago")
    collection_note = publish(client, alice_token, {
        "post_type": "note", "title": "Three years ago", "body": "Collection note",
        "occurred_at": "2023-08-21T10:00:00Z", "collection_id": collection["id"],
    })
    private_article = publish(client, alice_token, {
        "post_type": "article", "title": "Private memory", "body": "Private",
        "visibility": "private",
    }, slug="private-memory")
    archived_note = publish(client, alice_token, {
        "post_type": "note", "title": "Archived memory", "body": "Archived",
        "occurred_at": "2021-08-21T08:00:00Z", "visibility": "login_only",
    })
    wrong_day = publish(client, alice_token, {
        "post_type": "note", "title": "Wrong day", "body": "Not today",
        "occurred_at": "2024-08-20T08:00:00Z", "visibility": "login_only",
    })
    current_year = publish(client, alice_token, {
        "post_type": "note", "title": "Current year", "body": "Not a memory yet",
        "occurred_at": "2026-08-21T08:00:00Z", "visibility": "login_only",
    })
    assert client.post(
        f"/api/v1/posts/{archived_note['id']}/archive", headers=auth(alice_token), json={}
    ).status_code == 200

    with app.app_context():
        db.session.get(Post, article["id"]).published_at = datetime(2024, 8, 21, 9, tzinfo=timezone.utc)
        db.session.get(Post, private_article["id"]).published_at = datetime(2022, 8, 21, 9, tzinfo=timezone.utc)
        db.session.commit()

    bob_response = client.get(
        "/api/v1/home/on-this-day?page=1&page_size=2", headers=auth(bob_token)
    )
    assert bob_response.status_code == 200
    bob_payload = bob_response.get_json()
    assert bob_payload["data"]["date"] == "2026-08-21"
    assert bob_payload["meta"]["pagination"]["total"] == 3
    assert [item["id"] for item in bob_payload["data"]["items"]] == [
        article["id"], collection_note["id"],
    ]
    assert [item["years_ago"] for item in bob_payload["data"]["items"]] == [2, 3]
    assert bob_payload["data"]["year_facets"] == [
        {"year": 2024, "years_ago": 2, "count": 1},
        {"year": 2023, "years_ago": 3, "count": 1},
        {"year": 2021, "years_ago": 5, "count": 1},
    ]

    second_page = client.get(
        "/api/v1/home/on-this-day?page=2&page_size=2", headers=auth(bob_token)
    ).get_json()
    assert [item["id"] for item in second_page["data"]["items"]] == [archived_note["id"]]

    charlie_data = client.get(
        "/api/v1/home/on-this-day", headers=auth(charlie_token)
    ).get_json()["data"]
    assert [item["id"] for item in charlie_data["items"]] == [article["id"], archived_note["id"]]
    assert collection["name"] not in str(charlie_data)

    alice_data = client.get(
        "/api/v1/home/on-this-day", headers=auth(alice_token)
    ).get_json()["data"]
    assert [item["id"] for item in alice_data["items"]] == [
        article["id"], collection_note["id"], private_article["id"], archived_note["id"],
    ]
    assert wrong_day["id"] not in [item["id"] for item in alice_data["items"]]
    assert current_year["id"] not in [item["id"] for item in alice_data["items"]]

    home = client.get("/api/v1/home", headers=auth(bob_token)).get_json()["data"]
    assert home["on_this_day"]["total"] == 3
    assert [item["id"] for item in home["on_this_day"]["items"]] == [
        article["id"], collection_note["id"], archived_note["id"],
    ]
    assert client.get("/api/v1/home/on-this-day").status_code == 401
