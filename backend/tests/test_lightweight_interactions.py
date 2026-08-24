from uuid import uuid4

from sqlalchemy import func

from app.extensions import db
from app.models import CommentMention, CommentReaction, Notification, PostReaction

from .conftest import auth, register, token_from


def account(client, username):
    response = register(client, username, nickname=username.title())
    return response.get_json()["data"]["user"], token_from(response)


def collection_post(client, creator, creator_token, members):
    collection = client.post("/api/v1/collections", headers=auth(creator_token), json={
        "name": "V37 Room", "slug": "v37-room", "member_ids": [item["id"] for item in members],
    }).get_json()["data"]
    post = client.post("/api/v1/posts", headers=auth(creator_token), json={
        "post_type": "article", "title": "V37 Post", "body": "body",
        "collection_id": collection["id"],
    }).get_json()["data"]
    assert client.post(
        f"/api/v1/posts/{post['id']}/publish", headers=auth(creator_token), json={"slug": "v37-post"},
    ).status_code == 200
    return collection, post


def test_fixed_reactions_mentions_quotes_idempotency_and_deep_links(client, app):
    alice, alice_token = account(client, "v37alice")
    bob, bob_token = account(client, "v37bob")
    charlie, charlie_token = account(client, "v37charlie")
    outsider, _ = account(client, "v37outsider")
    collection, post = collection_post(client, alice, alice_token, [bob, charlie])

    mentionable = client.get(
        f"/api/v1/comments/mentionable?post_id={post['id']}&q=v37",
        headers=auth(bob_token),
    ).get_json()["data"]
    assert {item["id"] for item in mentionable} == {alice["id"], charlie["id"]}
    assert outsider["id"] not in {item["id"] for item in mentionable}

    request_id = str(uuid4())
    payload = {
        "post_id": post["id"], "body": "@v37charlie 这段很有意思",
        "mention_user_ids": [charlie["id"]], "client_request_id": request_id,
    }
    created = client.post("/api/v1/comments", headers=auth(bob_token), json=payload)
    assert created.status_code == 201
    root = created.get_json()["data"]
    assert root["mentions"][0]["id"] == charlie["id"]
    assert len(root["reactions"]["items"]) == 6
    repeated = client.post("/api/v1/comments", headers=auth(bob_token), json=payload)
    assert repeated.status_code == 200
    assert repeated.get_json()["data"]["id"] == root["id"]

    reply = client.post("/api/v1/comments", headers=auth(charlie_token), json={
        "post_id": post["id"], "body": "收到，这是一级引用回复",
        "reply_to_comment_id": root["id"], "client_request_id": str(uuid4()),
    })
    assert reply.status_code == 201
    reply_data = reply.get_json()["data"]
    assert reply_data["parent_id"] == root["id"]
    assert reply_data["quoted_comment"]["id"] == root["id"]
    context = client.get(
        f"/api/v1/comments/{reply_data['id']}/context?page_size=10",
        headers=auth(bob_token),
    ).get_json()["data"]
    assert context == {"comment_id": reply_data["id"], "root_comment_id": root["id"], "page": 1}

    post_reaction = client.put(
        f"/api/v1/interactions/posts/{post['id']}/reaction",
        headers=auth(bob_token), json={"kind": "heart"},
    ).get_json()["data"]
    assert post_reaction["selected"] == "heart"
    assert next(item for item in post_reaction["items"] if item["kind"] == "heart")["count"] == 1
    repeated_reaction = client.put(
        f"/api/v1/interactions/posts/{post['id']}/reaction",
        headers=auth(bob_token), json={"kind": "heart"},
    ).get_json()["data"]
    assert next(item for item in repeated_reaction["items"] if item["kind"] == "heart")["count"] == 1
    switched = client.put(
        f"/api/v1/interactions/posts/{post['id']}/reaction",
        headers=auth(bob_token), json={"kind": "wow"},
    ).get_json()["data"]
    assert switched["selected"] == "wow"
    assert next(item for item in switched["items"] if item["kind"] == "heart")["count"] == 0

    comment_reaction = client.put(
        f"/api/v1/interactions/comments/{root['id']}/reaction",
        headers=auth(charlie_token), json={"kind": "celebrate"},
    ).get_json()["data"]
    assert comment_reaction["selected"] == "celebrate"
    assert next(item for item in comment_reaction["items"] if item["kind"] == "celebrate")["count"] == 1

    notices = client.get(
        "/api/v1/notifications?page_size=100", headers=auth(charlie_token),
    ).get_json()["data"]
    mention = next(item for item in notices if item["kind"] == "comment_mention")
    assert mention["summary"] == "@v37charlie 这段很有意思"
    assert mention["target_url"] == f"/articles/v37-post?comment={root['id']}#comment-{root['id']}"
    with app.app_context():
        assert db.session.scalar(db.select(func.count(CommentMention.id))) == 1
        assert db.session.scalar(db.select(func.count(PostReaction.id))) == 1
        assert db.session.scalar(db.select(func.count(CommentReaction.id))) == 1
        assert db.session.scalar(db.select(func.count(Notification.id)).where(
            Notification.kind == "comment_mention",
        )) == 1


def test_collection_preferences_and_acl_revocation_cover_new_interactions(client):
    alice, alice_token = account(client, "v37mutealice")
    bob, bob_token = account(client, "v37mutebob")
    charlie, charlie_token = account(client, "v37mutecharlie")
    collection, post = collection_post(client, alice, alice_token, [bob, charlie])

    assert client.put(
        f"/api/v1/collections/{collection['id']}/notification-preference",
        headers=auth(charlie_token), json={"level": "important"},
    ).status_code == 200
    first = client.post("/api/v1/comments", headers=auth(bob_token), json={
        "post_id": post["id"], "body": "@v37mutecharlie important",
        "mention_user_ids": [charlie["id"]], "client_request_id": str(uuid4()),
    }).get_json()["data"]
    important_notices = client.get(
        "/api/v1/notifications?page_size=100", headers=auth(charlie_token),
    ).get_json()["data"]
    assert any(item["kind"] == "comment_mention" and item["comment_id"] == first["id"] for item in important_notices)

    assert client.put(
        f"/api/v1/collections/{collection['id']}/notification-preference",
        headers=auth(charlie_token), json={"level": "muted"},
    ).status_code == 200
    second = client.post("/api/v1/comments", headers=auth(bob_token), json={
        "post_id": post["id"], "body": "@v37mutecharlie muted",
        "mention_user_ids": [charlie["id"]], "client_request_id": str(uuid4()),
    }).get_json()["data"]
    muted_notices = client.get(
        "/api/v1/notifications?page_size=100", headers=auth(charlie_token),
    ).get_json()["data"]
    assert not any(item["kind"] == "comment_mention" and item["comment_id"] == second["id"] for item in muted_notices)

    reply = client.post("/api/v1/comments", headers=auth(charlie_token), json={
        "post_id": post["id"], "body": "reply before removal",
        "reply_to_comment_id": first["id"], "client_request_id": str(uuid4()),
    }).get_json()["data"]
    assert client.put(
        f"/api/v1/collections/{collection['id']}/members",
        headers=auth(alice_token), json={"member_ids": [charlie["id"]]},
    ).status_code == 200

    for path in (
        f"/api/v1/comments?post_id={post['id']}",
        f"/api/v1/comments/mentionable?post_id={post['id']}",
        f"/api/v1/comments/{reply['id']}/context",
        f"/api/v1/interactions/posts/{post['id']}/reactions",
        f"/api/v1/interactions/comments/{first['id']}/reactions",
    ):
        assert client.get(path, headers=auth(bob_token)).status_code == 404
    assert client.put(
        f"/api/v1/interactions/posts/{post['id']}/reaction",
        headers=auth(bob_token), json={"kind": "heart"},
    ).status_code == 404

    bob_notices = client.get(
        "/api/v1/notifications?page_size=100", headers=auth(bob_token),
    ).get_json()["data"]
    old_reply = next(item for item in bob_notices if item["kind"] == "comment_reply")
    assert old_reply["target_url"] is None
    assert old_reply["summary"] is None
    assert old_reply["post_id"] is None
