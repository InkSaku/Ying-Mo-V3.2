import pytest

from .conftest import auth, register, token_from


def make_user(client, username):
    response = register(client, username)
    assert response.status_code == 201, response.get_json()
    return response.get_json()["data"]["user"], token_from(response)


@pytest.mark.parametrize(
    ("post_type", "publish_payload"),
    [
        ("article", {"slug": "independent-visible-article"}),
        ("note", {}),
    ],
)
def test_independent_login_only_survives_create_and_publish(client, post_type, publish_payload):
    _, token = make_user(client, f"author{post_type}")
    payload = {
        "post_type": post_type,
        "title": "Visible post",
        "body": "hello",
        "visibility": "login_only",
        "collection_id": None,
    }

    created = client.post("/api/v1/posts", headers=auth(token), json=payload)
    assert created.status_code == 201, created.get_json()
    assert created.get_json()["data"]["visibility"] == "login_only"
    post_id = created.get_json()["data"]["id"]

    published = client.post(
        f"/api/v1/posts/{post_id}/publish",
        headers=auth(token),
        json=publish_payload,
    )
    assert published.status_code == 200, published.get_json()
    assert published.get_json()["data"]["visibility"] == "login_only"


def test_independent_post_can_change_from_private_to_login_only(client):
    _, token = make_user(client, "visibilityeditor")
    created = client.post(
        "/api/v1/posts",
        headers=auth(token),
        json={
            "post_type": "note",
            "body": "private first",
            "visibility": "private",
            "collection_id": None,
        },
    )
    assert created.status_code == 201, created.get_json()
    post_id = created.get_json()["data"]["id"]

    updated = client.patch(
        f"/api/v1/posts/{post_id}",
        headers=auth(token),
        json={"visibility": "login_only", "collection_id": None},
    )
    assert updated.status_code == 200, updated.get_json()
    assert updated.get_json()["data"]["visibility"] == "login_only"


def test_detaching_from_collection_still_forces_private(client):
    _, token = make_user(client, "collectionauthor")
    collection = client.post(
        "/api/v1/collections",
        headers=auth(token),
        json={"name": "Shared", "slug": "visibility-shared", "member_ids": []},
    )
    assert collection.status_code == 201, collection.get_json()
    collection_id = collection.get_json()["data"]["id"]

    created = client.post(
        "/api/v1/posts",
        headers=auth(token),
        json={
            "post_type": "note",
            "body": "shared note",
            "collection_id": collection_id,
            "visibility": "login_only",
        },
    )
    assert created.status_code == 201, created.get_json()
    assert created.get_json()["data"]["visibility"] == "private"
    post_id = created.get_json()["data"]["id"]

    detached = client.patch(
        f"/api/v1/posts/{post_id}",
        headers=auth(token),
        json={"collection_id": None, "visibility": "login_only"},
    )
    assert detached.status_code == 200, detached.get_json()
    assert detached.get_json()["data"]["visibility"] == "private"
    assert detached.get_json()["data"]["collection"] is None
