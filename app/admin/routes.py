from datetime import datetime, timezone

from flask import Blueprint, request
from flask_jwt_extended import jwt_required
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError

from app.admin.service import admin_reason, record_admin_log
from app.collections.service import delete_collection
from app.common.auth import current_user
from app.common.pagination import pagination_meta, parse_pagination
from app.common.responses import error_response, success_response
from app.common.time import isoformat_utc
from app.extensions import db
from app.models import (
    AdminLog, Category, Collection, Comment, FeaturedContent, Media, Notification,
    Post, PostModerationStatus, SiteSetting, Tag, User, UserRole, UserStatus,
    post_tags,
)

bp = Blueprint("admin", __name__)


def utcnow():
    return datetime.now(timezone.utc)


def _admin():
    actor = current_user()
    if actor is None or actor.role != UserRole.SYSTEM_ADMIN.value:
        return None
    return actor


def _page(stmt, order_by):
    args = parse_pagination()
    if not args:
        return None
    page, size = args
    total = db.session.scalar(db.select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.session.scalars(stmt.order_by(*order_by).offset((page - 1) * size).limit(size)).all()
    return rows, pagination_meta(page, size, total)


def _reason(data):
    reason = admin_reason(data, required=True)
    if not reason:
        return None, error_response("VALIDATION_ERROR", "高风险操作必须填写 reason。", 422)
    return reason, None


@bp.get("/dashboard")
@jwt_required(locations=["headers"])
def dashboard():
    if _admin() is None:
        return error_response("PERMISSION_DENIED", "仅系统管理员可访问。", 403)
    return success_response({
        "users": db.session.scalar(db.select(func.count(User.id))) or 0,
        "posts": db.session.scalar(db.select(func.count(Post.id))) or 0,
        "articles": db.session.scalar(db.select(func.count(Post.id)).where(Post.post_type == "article")) or 0,
        "notes": db.session.scalar(db.select(func.count(Post.id)).where(Post.post_type == "note")) or 0,
        "drafts": db.session.scalar(db.select(func.count(Post.id)).where(Post.status == "draft")) or 0,
        "collections": db.session.scalar(db.select(func.count(Collection.id))) or 0,
        "comments": db.session.scalar(db.select(func.count(Comment.id))) or 0,
        "media": db.session.scalar(db.select(func.count(Media.id))) or 0,
        "recent_posts": [p.to_dict(include_body=False) for p in db.session.scalars(
            db.select(Post).order_by(Post.created_at.desc(), Post.id.desc()).limit(5)
        ).all()],
        "recent_comments": [{"id": c.id, "post_id": c.post_id, "author_id": c.author_id, "status": c.status}
            for c in db.session.scalars(db.select(Comment).order_by(Comment.created_at.desc()).limit(5)).all()],
    })


@bp.get("/users")
@jwt_required(locations=["headers"])
def users():
    if _admin() is None:
        return error_response("PERMISSION_DENIED", "仅系统管理员可访问。", 403)
    stmt = db.select(User)
    q = (request.args.get("q") or "").strip()
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(User.username_normalized.ilike(like), User.nickname.ilike(like)))
    result = _page(stmt, (User.created_at.desc(), User.id.desc()))
    if result is None:
        return error_response("VALIDATION_ERROR", "分页参数不合法。", 422)
    rows, meta = result
    data = []
    for user in rows:
        data.append({
            "id": user.id, "username": user.username_normalized, "nickname": user.nickname,
            "email": user.email, "status": user.status, "role": user.role,
            "created_at": isoformat_utc(user.created_at),
            "post_count": db.session.scalar(db.select(func.count(Post.id)).where(Post.author_id == user.id)) or 0,
            "collection_count": db.session.scalar(db.select(func.count(Collection.id)).where(Collection.creator_id == user.id)) or 0,
        })
    return success_response(data, meta=meta)


@bp.get("/posts")
@jwt_required(locations=["headers"])
def posts():
    if _admin() is None:
        return error_response("PERMISSION_DENIED", "仅系统管理员可访问。", 403)
    stmt = db.select(Post)
    q = (request.args.get("q") or "").strip()
    if q:
        like = f"%{q}%"; stmt = stmt.where(or_(Post.title.ilike(like), Post.summary.ilike(like), Post.body.ilike(like)))
    filters = {
        "author_id": Post.author_id, "post_type": Post.post_type, "status": Post.status,
        "visibility": Post.visibility, "moderation_status": Post.moderation_status,
        "category_id": Post.category_id, "collection_id": Post.collection_id,
    }
    for key, column in filters.items():
        value = request.args.get(key)
        if value not in (None, ""):
            stmt = stmt.where(column == (int(value) if key.endswith("_id") and value.isdigit() else value))
    tag_id = request.args.get("tag_id", type=int)
    if tag_id:
        stmt = stmt.join(post_tags, post_tags.c.post_id == Post.id).where(post_tags.c.tag_id == tag_id)
    result = _page(stmt, (Post.updated_at.desc(), Post.id.desc()))
    if result is None:
        return error_response("VALIDATION_ERROR", "分页参数不合法。", 422)
    rows, meta = result
    return success_response([p.to_dict(include_body=False) for p in rows], meta=meta)


@bp.get("/posts/<int:post_id>")
@jwt_required(locations=["headers"])
def post_preview(post_id):
    actor = _admin()
    if actor is None:
        return error_response("PERMISSION_DENIED", "仅系统管理员可访问。", 403)
    post = db.session.get(Post, post_id)
    if post is None:
        return error_response("RESOURCE_NOT_FOUND", "Post 不存在。", 404)
    record_admin_log(actor, "post.preview", "post", post.id)
    db.session.commit()
    return success_response(post.to_dict(include_body=True))


def _moderate_post(post_id, status, action):
    actor = _admin(); data = request.get_json(silent=True) or {}
    if actor is None:
        return error_response("PERMISSION_DENIED", "仅系统管理员可访问。", 403)
    reason, error = _reason(data)
    if error: return error
    post = db.session.get(Post, post_id)
    if post is None:
        return error_response("RESOURCE_NOT_FOUND", "Post 不存在。", 404)
    before = {"moderation_status": post.moderation_status}
    post.moderation_status = status
    record_admin_log(actor, action, "post", post.id, before=before, after={"moderation_status": status}, reason=reason)
    db.session.commit()
    return success_response({"id": post.id, "moderation_status": post.moderation_status})


@bp.post("/posts/<int:post_id>/hide")
@jwt_required(locations=["headers"])
def hide_post(post_id):
    return _moderate_post(post_id, PostModerationStatus.HIDDEN.value, "post.hide")


@bp.post("/posts/<int:post_id>/restore")
@jwt_required(locations=["headers"])
def restore_post(post_id):
    return _moderate_post(post_id, PostModerationStatus.ACTIVE.value, "post.restore")


@bp.delete("/posts/<int:post_id>")
@jwt_required(locations=["headers"])
def delete_post(post_id):
    actor = _admin(); data = request.get_json(silent=True) or {}
    if actor is None:
        return error_response("PERMISSION_DENIED", "仅系统管理员可访问。", 403)
    reason, error = _reason(data)
    if error: return error
    post = db.session.get(Post, post_id)
    if post is None or post.deleted_at is not None:
        return error_response("RESOURCE_NOT_FOUND", "Post 不存在。", 404)
    post.deleted_at = utcnow()
    record_admin_log(actor, "post.soft_delete", "post", post.id, before={"deleted_at": None}, after={"deleted_at": isoformat_utc(post.deleted_at)}, reason=reason)
    db.session.commit()
    return success_response({"deleted": True})


@bp.get("/collections")
@jwt_required(locations=["headers"])
def collections():
    if _admin() is None:
        return error_response("PERMISSION_DENIED", "仅系统管理员可访问。", 403)
    stmt = db.select(Collection)
    q = (request.args.get("q") or "").strip()
    if q:
        like = f"%{q}%"; stmt = stmt.where(or_(Collection.name.ilike(like), Collection.slug.ilike(like)))
    result = _page(stmt, (Collection.updated_at.desc(), Collection.id.desc()))
    if result is None:
        return error_response("VALIDATION_ERROR", "分页参数不合法。", 422)
    rows, meta = result
    data=[]
    for collection in rows:
        item=collection.to_dict(include_members=True)
        item["post_count"]=db.session.scalar(db.select(func.count(Post.id)).where(Post.collection_id==collection.id)) or 0
        data.append(item)
    return success_response(data, meta=meta)


def _moderate_collection(collection_id, status, action):
    actor = _admin(); data=request.get_json(silent=True) or {}
    if actor is None: return error_response("PERMISSION_DENIED","仅系统管理员可访问。",403)
    reason,error=_reason(data)
    if error: return error
    collection=db.session.get(Collection,collection_id)
    if collection is None or collection.deleted_at is not None:
        return error_response("RESOURCE_NOT_FOUND","Collection 不存在。",404)
    before={"status":collection.status}; collection.status=status
    record_admin_log(actor,action,"collection",collection.id,before=before,after={"status":status},reason=reason)
    db.session.commit(); return success_response({"id":collection.id,"status":status})


@bp.post("/collections/<int:collection_id>/hide")
@jwt_required(locations=["headers"])
def hide_collection(collection_id):
    return _moderate_collection(collection_id,"hidden","collection.hide")


@bp.post("/collections/<int:collection_id>/restore")
@jwt_required(locations=["headers"])
def restore_collection(collection_id):
    return _moderate_collection(collection_id,"active","collection.restore")


@bp.delete("/collections/<int:collection_id>")
@jwt_required(locations=["headers"])
def admin_delete_collection(collection_id):
    actor=_admin(); data=request.get_json(silent=True) or {}
    if actor is None: return error_response("PERMISSION_DENIED","仅系统管理员可访问。",403)
    reason,error=_reason(data)
    if error: return error
    collection=db.session.get(Collection,collection_id)
    if collection is None or collection.deleted_at is not None:
        return error_response("RESOURCE_NOT_FOUND","Collection 不存在。",404)
    mode=delete_collection(collection)
    record_admin_log(actor,"collection.delete","collection",collection_id,after={"mode":mode,"posts_detached":True},reason=reason)
    db.session.commit(); return success_response({"deleted":True,"mode":mode})


@bp.get("/comments")
@jwt_required(locations=["headers"])
def comments():
    if _admin() is None: return error_response("PERMISSION_DENIED","仅系统管理员可访问。",403)
    stmt=db.select(Comment)
    status=request.args.get("status")
    if status: stmt=stmt.where(Comment.status==status)
    post_id=request.args.get("post_id",type=int)
    if post_id: stmt=stmt.where(Comment.post_id==post_id)
    result=_page(stmt,(Comment.created_at.desc(),Comment.id.desc()))
    if result is None: return error_response("VALIDATION_ERROR","分页参数不合法。",422)
    rows,meta=result
    return success_response([{"id":c.id,"post_id":c.post_id,"author_id":c.author_id,"body":c.body,"status":c.status,"created_at":isoformat_utc(c.created_at)} for c in rows],meta=meta)


def _moderate_comment(comment_id,status,action):
    actor=_admin(); data=request.get_json(silent=True) or {}
    if actor is None: return error_response("PERMISSION_DENIED","仅系统管理员可访问。",403)
    reason,error=_reason(data)
    if error: return error
    comment=db.session.get(Comment,comment_id)
    if comment is None: return error_response("RESOURCE_NOT_FOUND","评论不存在。",404)
    before={"status":comment.status}; comment.status=status
    record_admin_log(actor,action,"comment",comment.id,before=before,after={"status":status},reason=reason)
    db.session.commit(); return success_response({"id":comment.id,"status":status})


@bp.post("/comments/<int:comment_id>/hide")
@jwt_required(locations=["headers"])
def hide_comment(comment_id): return _moderate_comment(comment_id,"hidden","comment.hide")


@bp.post("/comments/<int:comment_id>/restore")
@jwt_required(locations=["headers"])
def restore_comment(comment_id): return _moderate_comment(comment_id,"active","comment.restore")


@bp.get("/categories")
@jwt_required(locations=["headers"])
def categories():
    if _admin() is None: return error_response("PERMISSION_DENIED","仅系统管理员可访问。",403)
    rows=db.session.scalars(db.select(Category).order_by(Category.sort_order,Category.id)).all()
    return success_response([{**c.to_dict(),"post_count":db.session.scalar(db.select(func.count(Post.id)).where(Post.category_id==c.id)) or 0} for c in rows])


@bp.get("/tags")
@jwt_required(locations=["headers"])
def tags():
    if _admin() is None: return error_response("PERMISSION_DENIED","仅系统管理员可访问。",403)
    rows=db.session.scalars(db.select(Tag).order_by(Tag.name,Tag.id)).all()
    return success_response([{**t.to_dict(),"post_count":db.session.scalar(db.select(func.count()).select_from(post_tags).where(post_tags.c.tag_id==t.id)) or 0} for t in rows])


@bp.get("/media")
@jwt_required(locations=["headers"])
def media_list():
    if _admin() is None: return error_response("PERMISSION_DENIED","仅系统管理员可访问。",403)
    stmt=db.select(Media)
    for key,column in (("kind",Media.kind),("status",Media.status),("owner_id",Media.owner_id),("bound_type",Media.bound_type)):
        value=request.args.get(key)
        if value not in (None,""): stmt=stmt.where(column==(int(value) if key=="owner_id" and value.isdigit() else value))
    result=_page(stmt,(Media.created_at.desc(),Media.id.desc()))
    if result is None: return error_response("VALIDATION_ERROR","分页参数不合法。",422)
    rows,meta=result; return success_response([m.to_dict() for m in rows],meta=meta)


def _moderate_media(media_id,status,action):
    actor=_admin(); data=request.get_json(silent=True) or {}
    if actor is None: return error_response("PERMISSION_DENIED","仅系统管理员可访问。",403)
    reason,error=_reason(data)
    if error: return error
    media=db.session.get(Media,media_id)
    if media is None or media.deleted_at is not None: return error_response("RESOURCE_NOT_FOUND","媒体不存在。",404)
    targets=[media]
    if media.live_photo_pair_id:
        targets=db.session.scalars(db.select(Media).where(Media.live_photo_pair_id==media.live_photo_pair_id)).all()
    before={"status":media.status};
    for item in targets: item.status=status
    record_admin_log(actor,action,"media",media.id,before=before,after={"status":status,"pair_size":len(targets)},reason=reason)
    db.session.commit(); return success_response({"media":[m.to_dict() for m in targets]})


@bp.post("/media/<int:media_id>/hide")
@jwt_required(locations=["headers"])
def hide_media(media_id): return _moderate_media(media_id,"hidden","media.hide")


@bp.post("/media/<int:media_id>/restore")
@jwt_required(locations=["headers"])
def restore_media(media_id): return _moderate_media(media_id,"active","media.restore")


@bp.delete("/media/<int:media_id>")
@jwt_required(locations=["headers"])
def delete_media(media_id):
    actor=_admin(); data=request.get_json(silent=True) or {}
    if actor is None: return error_response("PERMISSION_DENIED","仅系统管理员可访问。",403)
    reason,error=_reason(data)
    if error: return error
    media=db.session.get(Media,media_id)
    if media is None or media.deleted_at is not None: return error_response("RESOURCE_NOT_FOUND","媒体不存在。",404)
    targets=[media]
    if media.live_photo_pair_id:
        targets=db.session.scalars(db.select(Media).where(Media.live_photo_pair_id==media.live_photo_pair_id)).all()
    now=utcnow()
    for item in targets: item.deleted_at=now; item.status="hidden"
    record_admin_log(actor,"media.soft_delete","media",media.id,after={"deleted_at":isoformat_utc(now),"pair_size":len(targets)},reason=reason)
    db.session.commit(); return success_response({"deleted":True,"media_ids":[item.id for item in targets]})


@bp.get("/featured")
@jwt_required(locations=["headers"])
def featured_list():
    if _admin() is None: return error_response("PERMISSION_DENIED","仅系统管理员可访问。",403)
    rows=db.session.scalars(db.select(FeaturedContent).order_by(FeaturedContent.sort_order,FeaturedContent.id)).all()
    return success_response([{"id":x.id,"content_type":x.content_type,"post_id":x.post_id,"collection_id":x.collection_id,"sort_order":x.sort_order,"is_active":x.is_active} for x in rows])


@bp.post("/featured")
@jwt_required(locations=["headers"])
def create_featured():
    actor=_admin(); data=request.get_json(silent=True) or {}
    if actor is None: return error_response("PERMISSION_DENIED","仅系统管理员可访问。",403)
    content_type=data.get("content_type")
    post_id=data.get("post_id"); collection_id=data.get("collection_id")
    if content_type=="article":
        post=db.session.get(Post,post_id) if isinstance(post_id,int) else None
        if post is None or post.post_type!="article" or post.status!="published" or post.deleted_at is not None:
            return error_response("VALIDATION_ERROR","精选 Article 不合法。",422)
        collection_id=None
    elif content_type=="collection":
        collection=db.session.get(Collection,collection_id) if isinstance(collection_id,int) else None
        if collection is None or collection.status!="active" or collection.deleted_at is not None:
            return error_response("VALIDATION_ERROR","精选 Collection 不合法。",422)
        post_id=None
    else: return error_response("VALIDATION_ERROR","content_type 不合法。",422)
    item=FeaturedContent(content_type=content_type,post_id=post_id,collection_id=collection_id,sort_order=data.get("sort_order",0),created_by_id=actor.id)
    db.session.add(item)
    try:
        db.session.flush(); record_admin_log(actor,"featured.create","featured",item.id,after={"content_type":content_type,"post_id":post_id,"collection_id":collection_id},reason=data.get("reason")); db.session.commit()
    except IntegrityError:
        db.session.rollback(); return error_response("DUPLICATE_RESOURCE","该内容已经精选。",409)
    return success_response({"id":item.id},201)


@bp.patch("/featured/<int:item_id>")
@jwt_required(locations=["headers"])
def update_featured(item_id):
    actor=_admin(); data=request.get_json(silent=True)
    if actor is None: return error_response("PERMISSION_DENIED","仅系统管理员可访问。",403)
    if not isinstance(data,dict): return error_response("VALIDATION_ERROR","请求体必须是 JSON 对象。",422)
    item=db.session.get(FeaturedContent,item_id)
    if item is None: return error_response("RESOURCE_NOT_FOUND","精选项不存在。",404)
    before={"sort_order":item.sort_order,"is_active":item.is_active}
    if "sort_order" in data:
        if isinstance(data["sort_order"],bool) or not isinstance(data["sort_order"],int):
            return error_response("VALIDATION_ERROR","sort_order 不合法。",422)
        item.sort_order=data["sort_order"]
    if "is_active" in data:
        if not isinstance(data["is_active"],bool): return error_response("VALIDATION_ERROR","is_active 不合法。",422)
        item.is_active=data["is_active"]
    record_admin_log(actor,"featured.update","featured",item.id,before=before,after={"sort_order":item.sort_order,"is_active":item.is_active},reason=data.get("reason"))
    db.session.commit(); return success_response({"id":item.id,"sort_order":item.sort_order,"is_active":item.is_active})


@bp.delete("/featured/<int:item_id>")
@jwt_required(locations=["headers"])
def delete_featured(item_id):
    actor=_admin(); data=request.get_json(silent=True) or {}
    if actor is None: return error_response("PERMISSION_DENIED","仅系统管理员可访问。",403)
    item=db.session.get(FeaturedContent,item_id)
    if item is None: return error_response("RESOURCE_NOT_FOUND","精选项不存在。",404)
    record_admin_log(actor,"featured.delete","featured",item.id,before={"content_type":item.content_type,"post_id":item.post_id,"collection_id":item.collection_id},reason=data.get("reason"))
    db.session.delete(item); db.session.commit(); return success_response(None)


@bp.get("/settings")
@jwt_required(locations=["headers"])
def settings():
    if _admin() is None: return error_response("PERMISSION_DENIED","仅系统管理员可访问。",403)
    rows=db.session.scalars(db.select(SiteSetting).order_by(SiteSetting.key)).all()
    return success_response({row.key:row.value for row in rows})


@bp.put("/settings")
@jwt_required(locations=["headers"])
def update_settings():
    actor=_admin(); data=request.get_json(silent=True)
    if actor is None: return error_response("PERMISSION_DENIED","仅系统管理员可访问。",403)
    if not isinstance(data,dict) or not isinstance(data.get("settings"),dict):
        return error_response("VALIDATION_ERROR","settings 必须是对象。",422)
    allowed={"site_name","site_description","about","footer","registration_message"}
    if set(data["settings"])-allowed:
        return error_response("VALIDATION_ERROR","包含不支持的站点设置。",422)
    before={row.key:row.value for row in db.session.scalars(db.select(SiteSetting)).all()}
    for key,value in data["settings"].items():
        row=db.session.get(SiteSetting,key)
        if row is None: db.session.add(SiteSetting(key=key,value=value,updated_by_id=actor.id))
        else: row.value=value; row.updated_by_id=actor.id
    record_admin_log(actor,"settings.update","settings","site",before=before,after=data["settings"],reason=data.get("reason"))
    db.session.commit(); return success_response(data["settings"])


@bp.post("/notifications")
@jwt_required(locations=["headers"])
def system_notification():
    actor=_admin(); data=request.get_json(silent=True) or {}
    if actor is None: return error_response("PERMISSION_DENIED","仅系统管理员可访问。",403)
    message=data.get("message"); user_ids=data.get("user_ids")
    if not isinstance(message,str) or not 1<=len(message.strip())<=500:
        return error_response("VALIDATION_ERROR","message 长度需为 1–500。",422)
    stmt=db.select(User.id).where(User.status==UserStatus.ACTIVE.value)
    if user_ids is not None:
        if not isinstance(user_ids,list) or any(not isinstance(x,int) for x in user_ids):
            return error_response("VALIDATION_ERROR","user_ids 不合法。",422)
        stmt=stmt.where(User.id.in_(set(user_ids)))
    recipients=list(db.session.scalars(stmt).all())
    db.session.add_all([Notification(user_id=user_id,actor_id=actor.id,kind="system",target_type="system",message=message.strip()) for user_id in recipients])
    record_admin_log(actor,"notification.send","notification","system",after={"recipient_count":len(recipients)},reason=data.get("reason"))
    db.session.commit(); return success_response({"recipient_count":len(recipients)},201)


@bp.get("/logs")
@jwt_required(locations=["headers"])
def logs():
    if _admin() is None: return error_response("PERMISSION_DENIED","仅系统管理员可访问。",403)
    stmt=db.select(AdminLog)
    action=request.args.get("action"); target_type=request.args.get("target_type")
    if action: stmt=stmt.where(AdminLog.action==action)
    if target_type: stmt=stmt.where(AdminLog.target_type==target_type)
    result=_page(stmt,(AdminLog.created_at.desc(),AdminLog.id.desc()))
    if result is None: return error_response("VALIDATION_ERROR","分页参数不合法。",422)
    rows,meta=result; return success_response([row.to_dict() for row in rows],meta=meta)
