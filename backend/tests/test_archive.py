from datetime import datetime, timezone

from app.extensions import db
from app.models import Post

from .conftest import auth, register, token_from


def make_user(client, username):
    response = register(client, username)
    assert response.status_code == 201
    return response.get_json()["data"]["user"], token_from(response)


def create_note(client, token, body, occurred_at, *, collection_id=None, visibility="login_only"):
    payload = {
        "post_type": "note",
        "body": body,
        "occurred_at": occurred_at,
        "visibility": visibility,
    }
    if collection_id is not None:
        payload["collection_id"] = collection_id
    response = client.post("/api/v1/posts", headers=auth(token), json=payload)
    assert response.status_code == 201, response.get_json()
    post = response.get_json()["data"]
    response = client.post(f"/api/v1/posts/{post['id']}/publish", headers=auth(token), json={})
    assert response.status_code == 200, response.get_json()
    return response.get_json()["data"]


def test_archive_semantic_time_pagination_facets_and_acl(client, app):
    alice, alice_token = make_user(client, "archivealice")
    bob, bob_token = make_user(client, "archivebob")
    _, charlie_token = make_user(client, "archivecharlie")

    collection_response = client.post("/api/v1/collections", headers=auth(alice_token), json={
        "name": "Archive Secret",
        "slug": "archive-secret",
        "member_ids": [bob["id"]],
    })
    assert collection_response.status_code == 201
    collection = collection_response.get_json()["data"]

    january_ids = []
    for day in range(1, 22):
        note = create_note(
            client,
            alice_token,
            f"January note {day}",
            f"2024-01-{day:02d}T12:00:00Z",
        )
        january_ids.append(note["id"])
    february = create_note(client, alice_token, "February note", "2024-02-10T12:00:00Z")
    collection_note = create_note(
        client,
        alice_token,
        "Collection January note",
        "2024-01-31T12:00:00Z",
        collection_id=collection["id"],
    )
    archived_note = create_note(client, alice_token, "Archived old note", "2022-05-01T12:00:00Z")
    assert client.post(
        f"/api/v1/posts/{archived_note['id']}/archive", headers=auth(alice_token), json={}
    ).status_code == 200
    private_note = create_note(
        client,
        alice_token,
        "Private management only",
        "2024-01-30T12:00:00Z",
        visibility="private",
    )

    article_response = client.post("/api/v1/posts", headers=auth(alice_token), json={
        "post_type": "article",
        "title": "Archive Article",
        "body": "Article body",
        "visibility": "login_only",
    })
    assert article_response.status_code == 201, article_response.get_json()
    article = article_response.get_json()["data"]
    assert client.post(
        f"/api/v1/posts/{article['id']}/publish",
        headers=auth(alice_token),
        json={"slug": "archive-article"},
    ).status_code == 200
    with app.app_context():
        row = db.session.get(Post, article["id"])
        row.published_at = datetime(2023, 12, 15, 12, tzinfo=timezone.utc)
        db.session.commit()

    bob_all = client.get("/api/v1/archive?page=1&page_size=20", headers=auth(bob_token)).get_json()
    bob_second = client.get("/api/v1/archive?page=2&page_size=20", headers=auth(bob_token)).get_json()
    charlie_all = client.get("/api/v1/archive?page=1&page_size=100", headers=auth(charlie_token)).get_json()
    alice_all = client.get("/api/v1/archive?page=1&page_size=100", headers=auth(alice_token)).get_json()
    assert bob_all["meta"]["pagination"]["total"] == 25
    assert len(bob_all["data"]["items"]) == 20 and len(bob_second["data"]["items"]) == 5
    assert charlie_all["meta"]["pagination"]["total"] == 24
    assert alice_all["meta"]["pagination"]["total"] == 26
    assert private_note["id"] in {item["id"] for item in alice_all["data"]["items"]}
    assert collection_note["id"] not in {item["id"] for item in charlie_all["data"]["items"]}
    assert private_note["id"] not in {item["id"] for item in charlie_all["data"]["items"]}
    assert private_note["id"] not in {item["id"] for item in bob_all["data"]["items"] + bob_second["data"]["items"]}

    bob_facets = {(item["year"], item["month"]): item["count"] for item in bob_all["data"]["month_facets"]}
    charlie_facets = {(item["year"], item["month"]): item["count"] for item in charlie_all["data"]["month_facets"]}
    assert bob_facets[(2024, 1)] == 22
    assert charlie_facets[(2024, 1)] == 21
    assert bob_facets[(2024, 2)] == 1
    assert bob_facets[(2023, 12)] == 1
    assert bob_facets[(2022, 5)] == 1

    january_first = client.get("/api/v1/archive/2024/1?page=1&page_size=20", headers=auth(bob_token)).get_json()
    january_second = client.get("/api/v1/archive/2024/1?page=2&page_size=20", headers=auth(bob_token)).get_json()
    year = client.get("/api/v1/archive/2024?page=1&page_size=100", headers=auth(bob_token)).get_json()
    assert january_first["meta"]["pagination"]["total"] == 22
    assert len(january_first["data"]["items"]) == 20 and len(january_second["data"]["items"]) == 2
    assert year["meta"]["pagination"]["total"] == 23
    assert february["id"] in {item["id"] for item in year["data"]["items"]}
    assert january_ids[-1] in {item["id"] for item in january_first["data"]["items"]}

    article_month = client.get("/api/v1/archive/2023/12", headers=auth(bob_token)).get_json()
    note_month = client.get("/api/v1/archive/2022/5", headers=auth(bob_token)).get_json()
    assert article_month["data"]["items"][0]["id"] == article["id"]
    assert article_month["data"]["items"][0]["slug"] == "archive-article"
    assert article_month["data"]["items"][0]["semantic_time"] == article_month["data"]["items"][0]["published_at"]
    assert note_month["data"]["items"][0]["id"] == archived_note["id"]
    assert note_month["data"]["items"][0]["semantic_time"].startswith("2022-05-01")
    assert client.get("/api/v1/archive/2024/13", headers=auth(bob_token)).status_code == 422
