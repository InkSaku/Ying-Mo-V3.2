from io import BytesIO

from PIL import Image
from sqlalchemy import func

from app.extensions import db
from app.models import AdminLog, Category, Comment, Media, Notification, User, UserRole

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
    assert updated.get_json()["data"]["cover_media"]["public_id"]==cover["public_id"]
    assert updated.get_json()["data"]["cover_media"]["thumbnail_path"].endswith("/thumbnail")
    assert client.get(f"/api/v1/uploads/images/{cover['public_id']}").status_code==401
    assert client.get(f"/api/v1/uploads/images/{cover['public_id']}",headers=auth(bob_token)).status_code==200
    assert client.get(f"/api/v1/uploads/images/{cover['public_id']}",headers=auth(charlie_token)).status_code==404

    image=upload_image(client,bob_token).get_json()["data"]
    post=client.post("/api/v1/posts",headers=auth(bob_token),json={"post_type":"note","body":"with image","collection_id":collection["id"]}).get_json()["data"]
    assert client.post(f"/api/v1/uploads/{image['id']}/bind",headers=auth(bob_token),json={"bound_type":"post","bound_id":post["id"]}).status_code==200
    client.post(f"/api/v1/posts/{post['id']}/publish",headers=auth(bob_token),json={})
    readable=client.get(f"/api/v1/posts/{post['id']}",headers=auth(alice_token)).get_json()["data"]
    assert readable["bound_media"][0]["public_id"]==image["public_id"]
    assert "manage_path" not in readable["bound_media"][0]
    assert client.get(f"/api/v1/uploads/images/{image['public_id']}",headers=auth(alice_token)).status_code==200
    client.put(f"/api/v1/collections/{collection['id']}/members",headers=auth(alice_token),json={"member_ids":[]})
    assert client.get(f"/api/v1/uploads/images/{image['public_id']}",headers=auth(bob_token)).status_code==404
    assert client.get(f"/api/v1/uploads/manage/images/{image['public_id']}",headers=auth(bob_token)).status_code==200
    managed=client.get(f"/api/v1/posts/me/{post['id']}",headers=auth(bob_token)).get_json()["data"]
    assert managed["bound_media"][0]["manage_path"].endswith(image["public_id"])

    avatar=upload_image(client,bob_token,"green").get_json()["data"]
    assert client.patch("/api/v1/users/me",headers=auth(bob_token),json={"avatar_media_id":avatar["id"]}).status_code==200
    profile=client.get("/api/v1/users/bob",headers=auth(charlie_token)).get_json()["data"]
    assert profile["user"]["avatar_media"]["public_id"]==avatar["public_id"]
    assert client.get(f"/api/v1/uploads/images/{avatar['public_id']}").status_code==401
    assert client.get(f"/api/v1/uploads/images/{avatar['public_id']}",headers=auth(charlie_token)).status_code==200

    replacement=upload_image(client,bob_token,"purple").get_json()["data"]
    replaced=client.patch("/api/v1/users/me",headers=auth(bob_token),json={"avatar_media_id":replacement["id"]})
    assert replaced.status_code==200
    assert replaced.get_json()["data"]["avatar_media"]["public_id"]==replacement["public_id"]
    old_unbound=client.delete(f"/api/v1/uploads/{avatar['id']}/bind",headers=auth(bob_token))
    assert old_unbound.status_code==200
    assert old_unbound.get_json()["data"]["media"][0]["bound_type"] is None
    assert client.get("/api/v1/users/me/settings",headers=auth(bob_token)).get_json()["data"]["avatar_media_id"]==replacement["id"]

    removed=client.delete(f"/api/v1/uploads/{replacement['id']}/bind",headers=auth(bob_token))
    assert removed.status_code==200
    cleared=client.patch("/api/v1/users/me",headers=auth(bob_token),json={"avatar_media_id":None})
    assert cleared.status_code==200
    assert cleared.get_json()["data"]["avatar_media_id"] is None
    assert cleared.get_json()["data"]["avatar_media"] is None


def test_owner_can_unbind_media_and_cover_references_are_cleared(client,app):
    alice,alice_token=user(client,"alice")
    bob,bob_token=user(client,"bob")
    image=upload_image(client,alice_token).get_json()["data"]
    post=client.post("/api/v1/posts",headers=auth(alice_token),json={
        "post_type":"note","body":"keeps the note valid","cover_media_id":image["id"],
    }).get_json()["data"]
    assert post["cover_media"]["public_id"]==image["public_id"]
    managed_list=client.get("/api/v1/posts/me",headers=auth(alice_token)).get_json()["data"]
    assert managed_list[0]["cover_media"]["manage_thumbnail_path"].endswith("/thumbnail")
    assert client.delete(f"/api/v1/uploads/{image['id']}/bind",headers=auth(bob_token)).status_code==404

    response=client.delete(f"/api/v1/uploads/{image['id']}/bind",headers=auth(alice_token))
    assert response.status_code==200
    assert response.get_json()["data"]["unbound_from"]=={"bound_type":"post","bound_id":post["id"]}
    assert response.get_json()["data"]["media"][0]["manage_path"].endswith(image["public_id"])
    detail=client.get(f"/api/v1/posts/me/{post['id']}",headers=auth(alice_token)).get_json()["data"]
    assert detail["cover_media_id"] is None
    assert detail["cover_media"] is None
    assert detail["bound_media"]==[]
    with app.app_context():
        row=db.session.get(Media,image["id"])
        assert row.bound_type is None and row.bound_id is None


def test_category_options_include_active_categories_without_visible_posts(client,app):
    alice,alice_token=user(client,"alice")
    with app.app_context():
        db.session.add_all([
            Category(name="Unused",name_normalized="unused",slug="unused",is_active=True),
            Category(name="Disabled",name_normalized="disabled",slug="disabled",is_active=False),
        ])
        db.session.commit()

    discovery=client.get("/api/v1/categories",headers=auth(alice_token))
    options=client.get("/api/v1/categories/options",headers=auth(alice_token))
    assert discovery.status_code==200 and discovery.get_json()["data"]==[]
    assert options.status_code==200
    assert [item["slug"] for item in options.get_json()["data"]]==["unused"]


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
    managed=client.get(f"/api/v1/posts/me/{post['id']}",headers=auth(alice_token)).get_json()["data"]
    assert len(managed["bound_media"])==2
    assert {item["live_photo_manifest_path"] for item in managed["bound_media"]}=={
        f"/api/v1/uploads/live-photos/{pair['pair_id']}"
    }
    client.post(f"/api/v1/posts/{post['id']}/publish",headers=auth(alice_token),json={"visibility":"login_only"})
    manifest=client.get(f"/api/v1/uploads/live-photos/{pair['pair_id']}",headers=auth(bob_token))
    assert manifest.status_code==404  # draft default remained private until explicitly patched
    client.patch(f"/api/v1/posts/{post['id']}",headers=auth(alice_token),json={"visibility":"login_only"})
    manifest=client.get(f"/api/v1/uploads/live-photos/{pair['pair_id']}",headers=auth(bob_token))
    assert manifest.status_code==200
    video_path=manifest.get_json()["data"]["video_path"]
    assert client.get(video_path,headers=auth(bob_token)).status_code==200
    unbound=client.delete(f"/api/v1/uploads/{pair['image']['id']}/bind",headers=auth(alice_token))
    assert unbound.status_code==200
    assert len(unbound.get_json()["data"]["media"])==2
    assert all(item["bound_type"] is None for item in unbound.get_json()["data"]["media"])


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
    mine=client.get("/api/v1/users/me/comments",headers=auth(bob_token)).get_json()["data"]
    assert mine[0]["body"]=="[该评论已删除]"
    assert mine[0]["post"]=={
        "id":draft["id"],"post_type":"article","title":"Talk","canonical":"/articles/talk",
    }
    with app.app_context():
        assert db.session.get(Comment,reply.get_json()["data"]["id"]) is not None

    assert client.post(f"/api/v1/interactions/posts/{draft['id']}/like",headers=auth(bob_token)).get_json()["data"]=={"liked":True,"like_count":1}
    assert client.post(f"/api/v1/interactions/posts/{draft['id']}/like",headers=auth(bob_token)).get_json()["data"]=={"liked":False,"like_count":0}
    assert client.post(f"/api/v1/interactions/posts/{draft['id']}/favorite",headers=auth(bob_token)).get_json()["data"]["favorited"] is True
    assert client.get("/api/v1/interactions/favorites",headers=auth(bob_token)).get_json()["meta"]["pagination"]["total"]==1
    notifications=client.get("/api/v1/notifications",headers=auth(alice_token)).get_json()["data"]
    assert any(item["kind"]=="post_comment" and item["target_url"]=="/articles/talk" for item in notifications)
    assert all(item["kind"]!="like" for item in notifications)


def test_interaction_state_two_accounts_pagination_and_acl_convergence(client, app):
    alice,alice_token=user(client,"interactalice")
    bob,bob_token=user(client,"interactbob")
    charlie,charlie_token=user(client,"interactcharlie")
    posts=[]
    for index in range(21):
        draft=client.post("/api/v1/posts",headers=auth(alice_token),json={
            "post_type":"note","body":f"favorite {index}","visibility":"login_only",
        }).get_json()["data"]
        assert client.post(
            f"/api/v1/posts/{draft['id']}/publish",headers=auth(alice_token),json={}
        ).status_code==200
        posts.append(draft)

    target=posts[0]
    initial=client.get(f"/api/v1/interactions/posts/{target['id']}",headers=auth(bob_token))
    assert initial.get_json()["data"]=={"liked":False,"favorited":False,"like_count":0}
    assert client.post(f"/api/v1/interactions/posts/{target['id']}/like",headers=auth(bob_token)).get_json()["data"]=={
        "liked":True,"like_count":1,
    }
    assert client.post(f"/api/v1/interactions/posts/{target['id']}/like",headers=auth(charlie_token)).get_json()["data"]=={
        "liked":True,"like_count":2,
    }
    assert client.get(f"/api/v1/interactions/posts/{target['id']}",headers=auth(bob_token)).get_json()["data"]=={
        "liked":True,"favorited":False,"like_count":2,
    }
    assert client.post(f"/api/v1/interactions/posts/{target['id']}/like",headers=auth(bob_token)).get_json()["data"]=={
        "liked":False,"like_count":1,
    }

    for post in posts:
        response=client.post(f"/api/v1/interactions/posts/{post['id']}/favorite",headers=auth(bob_token))
        assert response.status_code==200 and response.get_json()["data"]["favorited"] is True
    second_page=client.get("/api/v1/interactions/favorites?page=2&page_size=20",headers=auth(bob_token)).get_json()
    assert second_page["meta"]["pagination"]=={
        "page":2,"page_size":20,"total":21,"total_pages":2,"has_next":False,"has_previous":True,
    }
    assert len(second_page["data"])==1
    last_id=second_page["data"][0]["id"]
    assert client.post(f"/api/v1/interactions/posts/{last_id}/favorite",headers=auth(bob_token)).get_json()["data"]["favorited"] is False
    converged=client.get("/api/v1/interactions/favorites?page=2&page_size=20",headers=auth(bob_token)).get_json()
    assert converged["data"]==[]
    assert converged["meta"]["pagination"]["total_pages"]==1

    collection=client.post("/api/v1/collections",headers=auth(alice_token),json={
        "name":"Interaction Room","slug":"interaction-room","member_ids":[bob["id"]],
    }).get_json()["data"]
    secret=client.post("/api/v1/posts",headers=auth(alice_token),json={
        "post_type":"article","title":"Interaction Secret","body":"hidden body",
        "collection_id":collection["id"],
    }).get_json()["data"]
    client.post(f"/api/v1/posts/{secret['id']}/publish",headers=auth(alice_token),json={"slug":"interaction-secret"})
    assert client.post(f"/api/v1/interactions/posts/{secret['id']}/favorite",headers=auth(bob_token)).status_code==200
    assert client.post(f"/api/v1/interactions/posts/{secret['id']}/like",headers=auth(bob_token)).status_code==200
    assert client.get(f"/api/v1/interactions/posts/{secret['id']}",headers=auth(charlie_token)).status_code==404
    client.put(f"/api/v1/collections/{collection['id']}/members",headers=auth(alice_token),json={"member_ids":[]})
    assert client.get(f"/api/v1/interactions/posts/{secret['id']}",headers=auth(bob_token)).status_code==404
    visible=client.get("/api/v1/interactions/favorites?page=1&page_size=100",headers=auth(bob_token)).get_json()
    assert all(item["id"]!=secret["id"] for item in visible["data"])
    assert "Interaction Secret" not in str(visible)
    assert "interaction-room" not in str(visible)
    with app.app_context():
        assert db.session.scalar(db.select(func.count(Notification.id)).where(Notification.kind=="like"))==0


def test_comment_pagination_unicode_limit_reply_flattening_and_acl(client):
    alice,alice_token=user(client,"commentalice")
    bob,bob_token=user(client,"commentbob")
    charlie,charlie_token=user(client,"commentcharlie")
    draft=client.post("/api/v1/posts",headers=auth(alice_token),json={
        "post_type":"article","title":"Thread","body":"body","visibility":"login_only",
    }).get_json()["data"]
    client.post(f"/api/v1/posts/{draft['id']}/publish",headers=auth(alice_token),json={"slug":"thread"})

    root_response=client.post("/api/v1/comments",headers=auth(bob_token),json={
        "post_id":draft["id"],"body":"🙂"*500,
    })
    assert root_response.status_code==201
    root=root_response.get_json()["data"]
    assert client.post("/api/v1/comments",headers=auth(bob_token),json={
        "post_id":draft["id"],"body":"🙂"*501,
    }).status_code==422

    first_reply=client.post("/api/v1/comments",headers=auth(charlie_token),json={
        "post_id":draft["id"],"body":"first reply","reply_to_comment_id":root["id"],
    }).get_json()["data"]
    second_reply=client.post("/api/v1/comments",headers=auth(alice_token),json={
        "post_id":draft["id"],"body":"reply to reply","reply_to_comment_id":first_reply["id"],
    }).get_json()["data"]
    assert second_reply["parent_id"]==root["id"]
    assert second_reply["reply_to_comment_id"]==first_reply["id"]

    for index in range(10):
        response=client.post("/api/v1/comments",headers=auth(bob_token),json={
            "post_id":draft["id"],"body":f"root {index}",
        })
        assert response.status_code==201

    first_page=client.get(
        f"/api/v1/comments?post_id={draft['id']}&page=1&page_size=10",
        headers=auth(alice_token),
    ).get_json()
    assert {
        key:first_page["meta"]["pagination"][key]
        for key in ("page","page_size","total","total_pages")
    }=={"page":1,"page_size":10,"total":11,"total_pages":2}
    assert len(first_page["data"])==10
    assert [reply["id"] for reply in first_page["data"][0]["replies"]]==[
        first_reply["id"],second_reply["id"],
    ]
    second_page=client.get(
        f"/api/v1/comments?post_id={draft['id']}&page=2&page_size=10",
        headers=auth(alice_token),
    ).get_json()
    assert len(second_page["data"])==1

    assert client.get(f"/api/v1/comments?post_id={draft['id']}").status_code==401
    private_post=client.post("/api/v1/posts",headers=auth(alice_token),json={
        "post_type":"note","body":"private thread",
    }).get_json()["data"]
    client.post(f"/api/v1/posts/{private_post['id']}/publish",headers=auth(alice_token),json={})
    assert client.get(
        f"/api/v1/comments?post_id={private_post['id']}",headers=auth(bob_token),
    ).status_code==404
    assert client.post("/api/v1/comments",headers=auth(bob_token),json={
        "post_id":private_post["id"],"body":"not allowed",
    }).status_code==404


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
