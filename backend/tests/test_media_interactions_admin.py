from io import BytesIO

from PIL import Image
from sqlalchemy import func

from app.extensions import db
from app.models import AdminLog, Comment, Media, User, UserRole

from .conftest import auth, register, token_from


def user(client,name):
    response=register(client,name)
    return response.get_json()["data"]["user"],token_from(response)


def png_bytes(color="red"):
    output=BytesIO(); Image.new("RGB",(12,12),color).save(output,"PNG"); return output.getvalue()


def upload_image(client,token,color="red"):
    return client.post("/api/v1/uploads/images",headers=auth(token),data={
        "file":(BytesIO(png_bytes(color)),"photo.png"),
    },content_type="multipart/form-data")


def test_post_media_collection_cover_avatar_and_removed_author_acl(client):
    alice,alice_token=user(client,"alice"); bob,bob_token=user(client,"bob"); charlie,charlie_token=user(client,"charlie")
    collection=client.post("/api/v1/collections",headers=auth(alice_token),json={"name":"Media Room","slug":"media-room","member_ids":[bob["id"]]}).get_json()["data"]

    cover=upload_image(client,alice_token,"blue").get_json()["data"]
    updated=client.patch(f"/api/v1/collections/{collection['id']}",headers=auth(alice_token),json={"cover_media_id":cover["id"]})
    assert updated.status_code==200
    assert client.get(f"/api/v1/uploads/images/{cover['public_id']}").status_code==401
    assert client.get(f"/api/v1/uploads/images/{cover['public_id']}",headers=auth(bob_token)).status_code==200
    assert client.get(f"/api/v1/uploads/images/{cover['public_id']}",headers=auth(charlie_token)).status_code==404

    image=upload_image(client,bob_token).get_json()["data"]
    post=client.post("/api/v1/posts",headers=auth(bob_token),json={"post_type":"note","body":"with image","collection_id":collection["id"]}).get_json()["data"]
    assert client.post(f"/api/v1/uploads/{image['id']}/bind",headers=auth(bob_token),json={"bound_type":"post","bound_id":post["id"]}).status_code==200
    client.post(f"/api/v1/posts/{post['id']}/publish",headers=auth(bob_token),json={})
    assert client.get(f"/api/v1/uploads/images/{image['public_id']}",headers=auth(alice_token)).status_code==200
    client.put(f"/api/v1/collections/{collection['id']}/members",headers=auth(alice_token),json={"member_ids":[]})
    assert client.get(f"/api/v1/uploads/images/{image['public_id']}",headers=auth(bob_token)).status_code==404
    assert client.get(f"/api/v1/uploads/manage/images/{image['public_id']}",headers=auth(bob_token)).status_code==200

    avatar=upload_image(client,bob_token,"green").get_json()["data"]
    assert client.patch("/api/v1/users/me",headers=auth(bob_token),json={"avatar_media_id":avatar["id"]}).status_code==200
    assert client.get(f"/api/v1/uploads/images/{avatar['public_id']}").status_code==401
    assert client.get(f"/api/v1/uploads/images/{avatar['public_id']}",headers=auth(charlie_token)).status_code==200


def test_live_photo_pair_validation_binding_and_acl(client):
    alice,alice_token=user(client,"alice"); bob,bob_token=user(client,"bob")
    video=b"\x00\x00\x00\x18ftypqt  "+b"0"*40
    uploaded=client.post("/api/v1/uploads/live-photos",headers=auth(alice_token),data={
        "image":(BytesIO(png_bytes()),"live.png"),"video":(BytesIO(video),"live.mov"),
    },content_type="multipart/form-data")
    assert uploaded.status_code==201,uploaded.get_json()
    pair=uploaded.get_json()["data"]
    post=client.post("/api/v1/posts",headers=auth(alice_token),json={"post_type":"note","body":"live"}).get_json()["data"]
    bound=client.post(f"/api/v1/uploads/{pair['image']['id']}/bind",headers=auth(alice_token),json={"bound_type":"post","bound_id":post["id"]})
    assert bound.status_code==200
    assert len(bound.get_json()["data"]["media"])==2
    client.post(f"/api/v1/posts/{post['id']}/publish",headers=auth(alice_token),json={"visibility":"login_only"})
    manifest=client.get(f"/api/v1/uploads/live-photos/{pair['pair_id']}",headers=auth(bob_token))
    assert manifest.status_code==404  # draft default remained private until explicitly patched
    client.patch(f"/api/v1/posts/{post['id']}",headers=auth(alice_token),json={"visibility":"login_only"})
    manifest=client.get(f"/api/v1/uploads/live-photos/{pair['pair_id']}",headers=auth(bob_token))
    assert manifest.status_code==200
    video_path=manifest.get_json()["data"]["video_path"]
    assert client.get(video_path,headers=auth(bob_token)).status_code==200


def test_comments_replies_delete_semantics_likes_favorites_and_notifications(client,app):
    alice,alice_token=user(client,"alice"); bob,bob_token=user(client,"bob")
    draft=client.post("/api/v1/posts",headers=auth(alice_token),json={"post_type":"article","title":"Talk","body":"body","visibility":"login_only"}).get_json()["data"]
    client.post(f"/api/v1/posts/{draft['id']}/publish",headers=auth(alice_token),json={"slug":"talk"})
    root=client.post("/api/v1/comments",headers=auth(bob_token),json={"post_id":draft["id"],"body":"root"}).get_json()["data"]
    reply=client.post("/api/v1/comments",headers=auth(alice_token),json={"post_id":draft["id"],"body":"reply","reply_to_comment_id":root["id"]})
    assert reply.status_code==201
    assert client.delete(f"/api/v1/comments/{root['id']}",headers=auth(bob_token)).status_code==200
    comments=client.get(f"/api/v1/comments?post_id={draft['id']}",headers=auth(alice_token)).get_json()["data"]
    assert comments[0]["body"]=="[该评论已删除]"
    assert len(comments[0]["replies"])==1
    with app.app_context():
        assert db.session.get(Comment,reply.get_json()["data"]["id"]) is not None

    assert client.post(f"/api/v1/interactions/posts/{draft['id']}/like",headers=auth(bob_token)).get_json()["data"]=={"liked":True,"like_count":1}
    assert client.post(f"/api/v1/interactions/posts/{draft['id']}/like",headers=auth(bob_token)).get_json()["data"]=={"liked":False,"like_count":0}
    assert client.post(f"/api/v1/interactions/posts/{draft['id']}/favorite",headers=auth(bob_token)).get_json()["data"]["favorited"] is True
    assert client.get("/api/v1/interactions/favorites",headers=auth(bob_token)).get_json()["meta"]["pagination"]["total"]==1
    notifications=client.get("/api/v1/notifications",headers=auth(alice_token)).get_json()["data"]
    assert any(item["kind"]=="post_comment" and item["target_url"]=="/articles/talk" for item in notifications)
    assert all(item["kind"]!="like" for item in notifications)


def test_admin_boundary_featured_settings_media_moderation_and_logs(client,app):
    admin,admin_token=user(client,"admin"); alice,alice_token=user(client,"alice")
    with app.app_context():
        row=db.session.get(User,admin["id"]); row.role=UserRole.SYSTEM_ADMIN.value; db.session.commit()
    assert client.get("/api/v1/admin/dashboard",headers=auth(alice_token)).status_code==403
    private=client.post("/api/v1/posts",headers=auth(alice_token),json={"post_type":"note","body":"private admin boundary"}).get_json()["data"]
    client.post(f"/api/v1/posts/{private['id']}/publish",headers=auth(alice_token),json={})
    assert client.get(f"/api/v1/posts/{private['id']}",headers=auth(admin_token)).status_code==404
    article=client.post("/api/v1/posts",headers=auth(alice_token),json={"post_type":"article","title":"Featured","body":"body","visibility":"login_only"}).get_json()["data"]
    client.post(f"/api/v1/posts/{article['id']}/publish",headers=auth(alice_token),json={"slug":"featured"})

    featured=client.post("/api/v1/admin/featured",headers=auth(admin_token),json={"content_type":"article","post_id":article["id"],"reason":"homepage"})
    assert featured.status_code==201
    home=client.get("/api/v1/home",headers=auth(alice_token)).get_json()["data"]
    assert home["featured_articles"][0]["id"]==article["id"]
    hidden=client.post(f"/api/v1/admin/posts/{article['id']}/hide",headers=auth(admin_token),json={"reason":"moderation test"})
    assert hidden.status_code==200
    assert client.get(f"/api/v1/posts/{article['id']}",headers=auth(alice_token)).status_code==404
    assert client.post(f"/api/v1/admin/posts/{article['id']}/restore",headers=auth(admin_token),json={"reason":"restored"}).status_code==200

    settings=client.put("/api/v1/admin/settings",headers=auth(admin_token),json={"settings":{"site_name":"Ying-Mo"},"reason":"initial config"})
    assert settings.status_code==200
    media=upload_image(client,alice_token).get_json()["data"]
    assert client.post(f"/api/v1/admin/media/{media['id']}/hide",headers=auth(admin_token),json={"reason":"media check"}).status_code==200
    assert client.get(f"/api/v1/uploads/images/{media['public_id']}",headers=auth(alice_token)).status_code==404
    assert client.post(f"/api/v1/admin/media/{media['id']}/restore",headers=auth(admin_token),json={"reason":"media restored"}).status_code==200

    logs=client.get("/api/v1/admin/logs",headers=auth(admin_token))
    assert logs.status_code==200
    actions={item["action"] for item in logs.get_json()["data"]}
    assert {"featured.create","post.hide","post.restore","settings.update","media.hide","media.restore"}<=actions
    with app.app_context():
        assert db.session.scalar(db.select(func.count(AdminLog.id)))>=6
