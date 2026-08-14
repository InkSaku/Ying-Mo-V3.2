from sqlalchemy import func

from app.extensions import db
from app.models import Category, Collection, Post, User

from .conftest import auth, register, token_from


def user(client,name):
    response=register(client,name)
    return response.get_json()["data"]["user"],token_from(response)


def test_collection_acl_is_applied_before_all_discovery_counts_and_facets(client,app):
    alice,alice_token=user(client,"alice")
    bob,bob_token=user(client,"bob")
    charlie,charlie_token=user(client,"charlie")
    with app.app_context():
        category=Category(name="Secret Category",name_normalized="secret category",slug="secret-category")
        db.session.add(category); db.session.commit(); category_id=category.id
    collection=client.post("/api/v1/collections",headers=auth(alice_token),json={
        "name":"Private Trip","slug":"private-trip","member_ids":[bob["id"]],
    }).get_json()["data"]
    draft=client.post("/api/v1/posts",headers=auth(alice_token),json={
        "post_type":"article","title":"Needle Secret","summary":"Hidden summary","body":"secret body",
        "collection_id":collection["id"],"category_id":category_id,"tag_names":["Secret Tag"],
    }).get_json()["data"]
    post_id=draft["id"]
    assert client.post(f"/api/v1/posts/{post_id}/publish",headers=auth(alice_token),json={"slug":"needle-secret"}).status_code==200

    assert client.get(f"/api/v1/posts/{post_id}",headers=auth(charlie_token)).status_code==404
    assert client.get("/api/v1/posts/slug/needle-secret",headers=auth(charlie_token)).status_code==404
    assert client.get("/api/v1/collections/private-trip",headers=auth(charlie_token)).status_code==404

    surfaces=(
        "/api/v1/posts","/api/v1/home","/api/v1/archive","/api/v1/search?q=Needle",
        "/api/v1/users/alice","/api/v1/categories/secret-category",
        "/api/v1/search/suggestions?q=Needle",
    )
    for path in surfaces:
        response=client.get(path,headers=auth(charlie_token))
        assert response.status_code==200,path
        payload=str(response.get_json())
        assert "Needle Secret" not in payload
        assert "Hidden summary" not in payload
        assert "private-trip" not in payload

    tag=client.get("/api/v1/tags").status_code
    assert tag==401
    tag_list=client.get("/api/v1/tags",headers=auth(charlie_token)).get_json()["data"]
    assert all(item["slug"]!="secret-tag" for item in tag_list)
    assert client.get("/api/v1/tags/secret-tag",headers=auth(charlie_token)).status_code==404
    assert client.get("/api/v1/search?q=Secret",headers=auth(charlie_token)).get_json()["meta"]["pagination"]["total"]==0

    assert client.get(f"/api/v1/posts/{post_id}",headers=auth(bob_token)).status_code==200
    assert client.get("/api/v1/search?q=Needle",headers=auth(bob_token)).get_json()["meta"]["pagination"]["total"]==1


def test_removed_author_management_exception_is_minimal_and_publish_is_blocked(client,app):
    alice,alice_token=user(client,"alice")
    bob,bob_token=user(client,"bob")
    collection=client.post("/api/v1/collections",headers=auth(alice_token),json={
        "name":"Shared","slug":"shared","member_ids":[bob["id"]],
    }).get_json()["data"]
    history=client.post("/api/v1/posts",headers=auth(bob_token),json={
        "post_type":"note","body":"historical","collection_id":collection["id"],
    }).get_json()["data"]
    assert client.post(f"/api/v1/posts/{history['id']}/publish",headers=auth(bob_token),json={}).status_code==200
    pending=client.post("/api/v1/posts",headers=auth(bob_token),json={
        "post_type":"note","body":"pending","collection_id":collection["id"],
    }).get_json()["data"]
    client.put(f"/api/v1/collections/{collection['id']}/members",headers=auth(alice_token),json={"member_ids":[]})

    assert client.get(f"/api/v1/posts/{history['id']}",headers=auth(bob_token)).status_code==404
    edited=client.patch(f"/api/v1/posts/{history['id']}",headers=auth(bob_token),json={"body":"still mine"})
    assert edited.status_code==200
    data=edited.get_json()["data"]
    assert data["collection_id"]==collection["id"]
    assert data["collection"] is None
    assert "Shared" not in str(data)
    managed=client.get(f"/api/v1/posts/me/{history['id']}",headers=auth(bob_token))
    assert managed.status_code==200
    assert managed.get_json()["data"]["body"]=="still mine"
    assert managed.get_json()["data"]["collection"] is None
    mine=client.get("/api/v1/posts/me",headers=auth(bob_token)).get_json()["data"]
    assert {history["id"],pending["id"]}<={item["id"] for item in mine}
    blocked=client.post(f"/api/v1/posts/{pending['id']}/publish",headers=auth(bob_token),json={})
    assert blocked.status_code==403

    detached=client.post(f"/api/v1/posts/{history['id']}/remove-from-collection",headers=auth(bob_token))
    assert detached.status_code==200
    assert detached.get_json()["data"]["collection_id"] is None
    assert detached.get_json()["data"]["visibility"]=="private"


def test_select_all_members_is_snapshot_and_creator_cannot_be_member(client):
    alice,alice_token=user(client,"alice")
    bob,bob_token=user(client,"bob")
    collection=client.post("/api/v1/collections",headers=auth(alice_token),json={
        "name":"Everyone Now","slug":"everyone-now","select_all_members":True,
    })
    assert collection.status_code==201
    assert {member["id"] for member in collection.get_json()["data"]["members"]}=={bob["id"]}
    charlie,charlie_token=user(client,"charlie")
    assert client.get("/api/v1/collections/everyone-now",headers=auth(charlie_token)).status_code==404
    invalid=client.post("/api/v1/collections",headers=auth(alice_token),json={
        "name":"Bad","slug":"bad","member_ids":[alice["id"]],
    })
    assert invalid.status_code==422


def test_collection_reorder_and_move_are_authorized_and_atomic(client):
    alice,alice_token=user(client,"alice"); bob,bob_token=user(client,"bob")
    first=client.post("/api/v1/collections",headers=auth(alice_token),json={"name":"A","slug":"a","member_ids":[bob["id"]]}).get_json()["data"]
    second=client.post("/api/v1/collections",headers=auth(bob_token),json={"name":"B","slug":"b"}).get_json()["data"]
    ids=[]
    for body in ("one","two"):
        post=client.post("/api/v1/posts",headers=auth(bob_token),json={"post_type":"note","body":body,"collection_id":first["id"]}).get_json()["data"]
        client.post(f"/api/v1/posts/{post['id']}/publish",headers=auth(bob_token),json={}); ids.append(post["id"])
    assert client.post(f"/api/v1/collections/{first['id']}/reorder",headers=auth(bob_token),json={"post_ids":ids}).status_code==404
    assert client.post(f"/api/v1/collections/{first['id']}/reorder",headers=auth(alice_token),json={"post_ids":list(reversed(ids))}).status_code==200
    detail=client.get("/api/v1/collections/a",headers=auth(alice_token)).get_json()["data"]
    assert [item["id"] for item in detail["posts"]]==list(reversed(ids))
    moved=client.post(f"/api/v1/posts/{ids[0]}/move-collection",headers=auth(bob_token),json={"collection_id":second["id"]})
    assert moved.status_code==200
    assert moved.get_json()["data"]["collection_id"]==second["id"]
    assert moved.get_json()["data"]["visibility"]=="private"
