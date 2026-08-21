from app.extensions import db
from app.explore.service import stable_pick
from app.models import FeaturedContent, User, UserStatus

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


def test_explore_is_stable_acl_scoped_and_contains_only_public_member_fields(client, app):
    alice_response = register(client, "explorealice", nickname="Alice")
    bob_response = register(client, "explorebob", nickname="Bob")
    charlie_response = register(client, "explorecharlie", nickname="Charlie")
    banned_response = register(client, "explorebanned", nickname="Banned")
    alice = alice_response.get_json()["data"]["user"]
    bob = bob_response.get_json()["data"]["user"]
    banned = banned_response.get_json()["data"]["user"]
    alice_token = token_from(alice_response)
    bob_token = token_from(bob_response)
    charlie_token = token_from(charlie_response)

    collection = client.post("/api/v1/collections", headers=auth(alice_token), json={
        "name": "Secret shared room",
        "slug": "secret-shared-room",
        "member_ids": [bob["id"]],
    }).get_json()["data"]
    public_articles = [
        publish(client, alice_token, {
            "post_type": "article",
            "title": f"Public article {index}",
            "body": "Explore article",
            "visibility": "login_only",
            "tag_names": ["Common"],
        }, slug=f"public-explore-{index}")
        for index in range(4)
    ]
    secret_article = publish(client, alice_token, {
        "post_type": "article",
        "title": "Collection secret needle",
        "body": "Only members can discover this",
        "collection_id": collection["id"],
        "tag_names": ["SecretTag"],
    }, slug="collection-secret-needle")
    private_article = publish(client, alice_token, {
        "post_type": "article",
        "title": "Author private needle",
        "body": "Private",
        "visibility": "private",
    }, slug="author-private-needle")
    notes = [
        publish(client, alice_token, {
            "post_type": "note",
            "title": f"Public note {index}",
            "body": "Explore note",
            "visibility": "login_only",
            "tag_names": ["Common"],
        })
        for index in range(3)
    ]
    archived_note = publish(client, alice_token, {
        "post_type": "note", "title": "Archived random exclusion", "body": "Archived",
        "visibility": "login_only", "tag_names": ["ArchivedOnly"],
    })
    assert client.post(
        f"/api/v1/posts/{archived_note['id']}/archive", headers=auth(alice_token), json={}
    ).status_code == 200

    with app.app_context():
        db.session.add(FeaturedContent(
            content_type="collection",
            collection_id=collection["id"],
            created_by_id=alice["id"],
            sort_order=1,
        ))
        db.session.get(User, banned["id"]).status = UserStatus.BANNED.value
        db.session.commit()

    bob_candidate_ids = [post["id"] for post in public_articles] + [secret_article["id"]]
    seed = next(
        f"batch-{index}" for index in range(100)
        if secret_article["id"] in stable_pick(
            bob_candidate_ids, seed=f"batch-{index}", scope="post:article", limit=4
        )
    )
    bob_first = client.get(f"/api/v1/explore?seed={seed}", headers=auth(bob_token))
    bob_second = client.get(f"/api/v1/explore?seed={seed}", headers=auth(bob_token))
    assert bob_first.status_code == 200
    assert bob_first.get_json()["data"] == bob_second.get_json()["data"]
    bob_data = bob_first.get_json()["data"]
    assert bob_data["seed"] == seed
    assert secret_article["id"] in [item["id"] for item in bob_data["random_articles"]]
    assert [item["id"] for item in bob_data["random_notes"]] == [
        item_id for item_id in stable_pick(
            [note["id"] for note in notes], seed=seed, scope="post:note", limit=4
        )
    ]
    assert [item["slug"] for item in bob_data["featured_collections"]] == ["secret-shared-room"]
    assert "secrettag" in [item["slug"] for item in bob_data["roaming_tags"]]

    charlie_response = client.get(f"/api/v1/explore?seed={seed}", headers=auth(charlie_token))
    assert charlie_response.status_code == 200
    charlie_data = charlie_response.get_json()["data"]
    charlie_text = str(charlie_data)
    assert "Collection secret needle" not in charlie_text
    assert "Secret shared room" not in charlie_text
    assert "secrettag" not in charlie_text
    assert "Author private needle" not in charlie_text
    assert charlie_data["featured_collections"] == []
    assert {item["id"] for item in charlie_data["random_articles"]} == {
        post["id"] for post in public_articles
    }
    assert archived_note["id"] not in [item["id"] for item in charlie_data["random_notes"]]
    assert "archivedonly" in [item["slug"] for item in charlie_data["roaming_tags"]]

    member_text = str(charlie_data["recent_members"])
    assert "explorebanned" not in member_text
    assert "@example.com" not in member_text
    assert all("status" not in member and "created_at" not in member for member in charlie_data["recent_members"])

    alice_candidate_ids = bob_candidate_ids + [private_article["id"]]
    alice_seed = next(
        f"private-{index}" for index in range(100)
        if private_article["id"] in stable_pick(
            alice_candidate_ids, seed=f"private-{index}", scope="post:article", limit=4
        )
    )
    alice_data = client.get(
        f"/api/v1/explore?seed={alice_seed}", headers=auth(alice_token)
    ).get_json()["data"]
    assert private_article["id"] in [item["id"] for item in alice_data["random_articles"]]
    assert client.get("/api/v1/explore?seed=bad%20seed", headers=auth(bob_token)).status_code == 422
    assert client.get("/api/v1/explore").status_code == 401
