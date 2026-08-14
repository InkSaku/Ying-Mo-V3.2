from datetime import datetime, timezone
from io import BytesIO

from flask import Blueprint, current_app, request, send_file
from flask_jwt_extended import jwt_required
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import aliased

from app.admin.service import admin_reason, record_admin_log
from app.collections.service import delete_collection
from app.common.auth import current_user
from app.common.pagination import pagination_meta, parse_pagination
from app.common.responses import error_response, success_response
from app.common.time import isoformat_utc
from app.extensions import db
from app.models import (
    AdminLog, Category, Collection, CollectionStatus, Comment, FeaturedContent, Media, MediaKind, Notification,
    Post, PostModerationStatus, PostStatus, PostType, PostVisibility, SiteSetting, Tag, User, UserRole, UserStatus,
    post_tags,
)
from app.storage import get_storage

bp = Blueprint("admin", __name__)

SITE_SETTING_SCHEMA = (
    {"key":"site_name","label":"站点名称","max_length":80,"required":True,"multiline":False,"default":"映墨"},
    {"key":"site_description","label":"站点简介","max_length":300,"required":False,"multiline":True,"default":"邀请制朋友记录空间。"},
    {"key":"about","label":"关于页面说明","max_length":5000,"required":False,"multiline":True,"default":""},
    {"key":"footer","label":"页脚文字","max_length":300,"required":False,"multiline":True,"default":"写字，也和朋友一起记录生活。"},
    {"key":"registration_message","label":"注册提示","max_length":500,"required":False,"multiline":True,"default":"注册需要站长提供的邀请码。"},
)


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
    recent_posts = list(db.session.scalars(
        db.select(Post).order_by(Post.created_at.desc(), Post.id.desc()).limit(5)
    ).all())
    recent_comments = list(db.session.scalars(
        db.select(Comment).order_by(Comment.created_at.desc(), Comment.id.desc()).limit(5)
    ).all())
    post_lookup = {
        post.id: post
        for post in db.session.scalars(db.select(Post).where(
            Post.id.in_({comment.post_id for comment in recent_comments})
        )).all()
    } if recent_comments else {}
    return success_response({
        "users": db.session.scalar(db.select(func.count(User.id))) or 0,
        "posts": db.session.scalar(db.select(func.count(Post.id))) or 0,
        "articles": db.session.scalar(db.select(func.count(Post.id)).where(Post.post_type == "article")) or 0,
        "notes": db.session.scalar(db.select(func.count(Post.id)).where(Post.post_type == "note")) or 0,
        "drafts": db.session.scalar(db.select(func.count(Post.id)).where(Post.status == "draft")) or 0,
        "collections": db.session.scalar(db.select(func.count(Collection.id))) or 0,
        "comments": db.session.scalar(db.select(func.count(Comment.id))) or 0,
        "media": db.session.scalar(db.select(func.count(Media.id))) or 0,
        "recent_posts": [{
            **post.to_dict(include_body=False, include_inactive_taxonomy=True),
            "deleted_at": isoformat_utc(post.deleted_at),
        } for post in recent_posts],
        "recent_comments": [{
            "id": comment.id,
            "post_id": comment.post_id,
            "author_id": comment.author_id,
            "author": comment.author.public_dict() if comment.author else None,
            "body": comment.body,
            "status": comment.status,
            "created_at": isoformat_utc(comment.created_at),
            "post": ({
                "id": post_lookup[comment.post_id].id,
                "post_type": post_lookup[comment.post_id].post_type,
                "title": post_lookup[comment.post_id].title,
            } if comment.post_id in post_lookup else None),
        } for comment in recent_comments],
        "system": {
            "status": "ok",
            "environment": current_app.config["APP_ENV"],
            "database": db.engine.dialect.name,
            "media_storage": current_app.config["MEDIA_STORAGE_BACKEND"],
        },
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
    status = (request.args.get("status") or "").strip()
    if status:
        if status not in {item.value for item in UserStatus}:
            return error_response("VALIDATION_ERROR", "用户状态筛选不合法。", 422)
        stmt = stmt.where(User.status == status)
    role = (request.args.get("role") or "").strip()
    if role:
        if role not in {item.value for item in UserRole}:
            return error_response("VALIDATION_ERROR", "用户角色筛选不合法。", 422)
        stmt = stmt.where(User.role == role)
    result = _page(stmt, (User.created_at.desc(), User.id.desc()))
    if result is None:
        return error_response("VALIDATION_ERROR", "分页参数不合法。", 422)
    rows, meta = result
    data = []
    for user in rows:
        data.append({
            "id": user.id, "username": user.username_normalized, "nickname": user.nickname,
            "email": user.email, "status": user.status, "role": user.role,
            "bio": user.bio, "region": user.region,
            "created_at": isoformat_utc(user.created_at),
            "updated_at": isoformat_utc(user.updated_at),
            "last_login_at": isoformat_utc(user.last_login_at),
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
    enum_filters = {
        "post_type": (Post.post_type, {item.value for item in PostType}),
        "status": (Post.status, {item.value for item in PostStatus}),
        "visibility": (Post.visibility, {item.value for item in PostVisibility}),
        "moderation_status": (Post.moderation_status, {item.value for item in PostModerationStatus}),
    }
    for key, (column, allowed) in enum_filters.items():
        value = (request.args.get(key) or "").strip()
        if value:
            if value not in allowed:
                return error_response("VALIDATION_ERROR", f"{key} 筛选不合法。", 422)
            stmt = stmt.where(column == value)
    id_filters = {
        "author_id": Post.author_id,
        "category_id": Post.category_id,
        "collection_id": Post.collection_id,
    }
    for key, column in id_filters.items():
        value = (request.args.get(key) or "").strip()
        if value:
            if not value.isdigit() or int(value) <= 0:
                return error_response("VALIDATION_ERROR", f"{key} 筛选不合法。", 422)
            stmt = stmt.where(column == int(value))
    tag_value = (request.args.get("tag_id") or "").strip()
    if tag_value:
        if not tag_value.isdigit() or int(tag_value) <= 0:
            return error_response("VALIDATION_ERROR", "tag_id 筛选不合法。", 422)
        stmt = stmt.join(post_tags, post_tags.c.post_id == Post.id).where(post_tags.c.tag_id == int(tag_value))
    result = _page(stmt, (Post.updated_at.desc(), Post.id.desc()))
    if result is None:
        return error_response("VALIDATION_ERROR", "分页参数不合法。", 422)
    rows, meta = result
    return success_response([{
        **post.to_dict(include_body=False, include_inactive_taxonomy=True),
        "deleted_at": isoformat_utc(post.deleted_at),
    } for post in rows], meta=meta)


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
    return success_response({
        **post.to_dict(include_body=True, include_inactive_taxonomy=True),
        "deleted_at": isoformat_utc(post.deleted_at),
    })


def _moderate_post(post_id, status, action):
    actor = _admin(); data = request.get_json(silent=True) or {}
    if actor is None:
        return error_response("PERMISSION_DENIED", "仅系统管理员可访问。", 403)
    reason, error = _reason(data)
    if error: return error
    post = db.session.get(Post, post_id)
    if post is None or post.deleted_at is not None:
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
    status = (request.args.get("status") or "").strip()
    if status:
        if status not in {item.value for item in CollectionStatus}:
            return error_response("VALIDATION_ERROR", "Collection 状态筛选不合法。", 422)
        stmt = stmt.where(Collection.status == status)
    result = _page(stmt, (Collection.updated_at.desc(), Collection.id.desc()))
    if result is None:
        return error_response("VALIDATION_ERROR", "分页参数不合法。", 422)
    rows, meta = result
    data=[]
    for collection in rows:
        item=collection.to_dict(include_members=True)
        item["post_count"]=db.session.scalar(db.select(func.count(Post.id)).where(Post.collection_id==collection.id)) or 0
        item["deleted_at"]=isoformat_utc(collection.deleted_at)
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
    status=(request.args.get("status") or "").strip()
    if status:
        if status not in {"active", "hidden", "deleted"}:
            return error_response("VALIDATION_ERROR", "评论状态筛选不合法。", 422)
        stmt=stmt.where(Comment.status==status)
    post_value=(request.args.get("post_id") or "").strip()
    if post_value:
        if not post_value.isdigit() or int(post_value)<=0:
            return error_response("VALIDATION_ERROR", "post_id 筛选不合法。", 422)
        stmt=stmt.where(Comment.post_id==int(post_value))
    result=_page(stmt,(Comment.created_at.desc(),Comment.id.desc()))
    if result is None: return error_response("VALIDATION_ERROR","分页参数不合法。",422)
    rows,meta=result
    post_lookup={
        post.id:post for post in db.session.scalars(db.select(Post).where(
            Post.id.in_({comment.post_id for comment in rows})
        )).all()
    } if rows else {}
    return success_response([{
        "id":comment.id,
        "post_id":comment.post_id,
        "author_id":comment.author_id,
        "author":comment.author.public_dict() if comment.author else None,
        "body":comment.body,
        "status":comment.status,
        "created_at":isoformat_utc(comment.created_at),
        "updated_at":isoformat_utc(comment.updated_at),
        "post":({
            "id":post_lookup[comment.post_id].id,
            "post_type":post_lookup[comment.post_id].post_type,
            "title":post_lookup[comment.post_id].title,
            "status":post_lookup[comment.post_id].status,
            "moderation_status":post_lookup[comment.post_id].moderation_status,
            "deleted_at":isoformat_utc(post_lookup[comment.post_id].deleted_at),
        } if comment.post_id in post_lookup else None),
    } for comment in rows],meta=meta)


def _moderate_comment(comment_id,status,action):
    actor=_admin(); data=request.get_json(silent=True) or {}
    if actor is None: return error_response("PERMISSION_DENIED","仅系统管理员可访问。",403)
    reason,error=_reason(data)
    if error: return error
    comment=db.session.get(Comment,comment_id)
    if comment is None or comment.status=="deleted": return error_response("RESOURCE_NOT_FOUND","评论不存在。",404)
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
    if _admin() is None:
        return error_response("PERMISSION_DENIED","仅系统管理员可访问。",403)
    # Live Photo is one logical asset in Admin even though it has two storage rows.
    # An orphaned video remains visible as an invalid pair so Admin can audit it.
    pair_image=aliased(Media)
    has_pair_image=db.select(pair_image.id).where(
        pair_image.live_photo_pair_id==Media.live_photo_pair_id,
        pair_image.kind==MediaKind.LIVE_PHOTO_IMAGE,
    ).exists()
    stmt=db.select(Media).where(or_(Media.kind!=MediaKind.LIVE_PHOTO_VIDEO,~has_pair_image))
    kind=(request.args.get("kind") or "").strip()
    if kind:
        if kind not in {"image","live_photo"}:
            return error_response("VALIDATION_ERROR","媒体类型筛选不合法。",422)
        stmt=stmt.where(
            Media.kind==MediaKind.IMAGE if kind=="image"
            else Media.live_photo_pair_id.is_not(None)
        )
    status=(request.args.get("status") or "").strip()
    if status:
        if status not in {"active","hidden"}:
            return error_response("VALIDATION_ERROR","媒体状态筛选不合法。",422)
        stmt=stmt.where(Media.status==status)
    owner_value=(request.args.get("owner_id") or "").strip()
    if owner_value:
        if not owner_value.isdigit() or int(owner_value)<=0:
            return error_response("VALIDATION_ERROR","owner_id 筛选不合法。",422)
        stmt=stmt.where(Media.owner_id==int(owner_value))
    bound_type=(request.args.get("bound_type") or "").strip()
    if bound_type:
        if bound_type not in {"post","collection","avatar","unbound"}:
            return error_response("VALIDATION_ERROR","绑定类型筛选不合法。",422)
        stmt=stmt.where(Media.bound_type.is_(None) if bound_type=="unbound" else Media.bound_type==bound_type)
    result=_page(stmt,(Media.created_at.desc(),Media.id.desc()))
    if result is None: return error_response("VALIDATION_ERROR","分页参数不合法。",422)
    rows,meta=result
    return success_response([_admin_media_dict(media) for media in rows],meta=meta)


def _admin_media_part(media):
    data=media.to_dict()
    data.update({
        "owner_id":media.owner_id,
        "admin_read_path":f"/api/v1/admin/media/{media.id}/content",
        "admin_thumbnail_path":(
            None if media.kind==MediaKind.LIVE_PHOTO_VIDEO
            else f"/api/v1/admin/media/{media.id}/content?thumbnail=1"
        ),
    })
    return data


def _media_binding(media):
    if media.bound_type=="post":
        target=db.session.get(Post,media.bound_id)
        return ({
            "type":"post","id":media.bound_id,"exists":target is not None,
            "label":target.title or f"{target.post_type} #{target.id}" if target else f"Post #{media.bound_id}",
            "status":target.status if target else None,
            "moderation_status":target.moderation_status if target else None,
            "deleted_at":isoformat_utc(target.deleted_at) if target else None,
        })
    if media.bound_type=="collection":
        target=db.session.get(Collection,media.bound_id)
        return ({
            "type":"collection","id":media.bound_id,"exists":target is not None,
            "label":target.name if target else f"Collection #{media.bound_id}",
            "status":target.status if target else None,
            "deleted_at":isoformat_utc(target.deleted_at) if target else None,
        })
    if media.bound_type=="avatar":
        target=db.session.get(User,media.bound_id)
        return ({
            "type":"avatar","id":media.bound_id,"exists":target is not None,
            "label":f"@{target.username_normalized}" if target else f"用户 #{media.bound_id}",
            "status":target.status if target else None,
            "deleted_at":None,
        })
    return None


def _admin_media_dict(media):
    data=_admin_media_part(media)
    data["logical_kind"]="live_photo" if media.live_photo_pair_id else "image"
    data["owner"]=media.owner.public_dict() if media.owner else None
    data["binding"]=_media_binding(media)
    if media.live_photo_pair_id:
        pair=list(db.session.scalars(
            db.select(Media).where(Media.live_photo_pair_id==media.live_photo_pair_id).order_by(Media.id)
        ).all())
        data["pair"]=[_admin_media_part(item) for item in pair]
        data["pair_integrity"]=(
            len(pair)==2
            and {item.kind for item in pair}=={MediaKind.LIVE_PHOTO_IMAGE,MediaKind.LIVE_PHOTO_VIDEO}
            and len({(item.owner_id,item.bound_type,item.bound_id,item.status,item.deleted_at) for item in pair})==1
        )
    else:
        data["pair"]=[_admin_media_part(media)]
        data["pair_integrity"]=True
    return data


def _media_targets(media):
    if media.live_photo_pair_id is None:
        return [media],None
    targets=list(db.session.scalars(
        db.select(Media).where(Media.live_photo_pair_id==media.live_photo_pair_id).order_by(Media.id)
    ).all())
    valid=(
        len(targets)==2
        and {item.kind for item in targets}=={MediaKind.LIVE_PHOTO_IMAGE,MediaKind.LIVE_PHOTO_VIDEO}
        and len({(item.owner_id,item.bound_type,item.bound_id,item.status,item.deleted_at) for item in targets})==1
    )
    if not valid:
        return None,error_response("CONFLICT","Live Photo 配对状态不一致，操作已拒绝。",409)
    return targets,None


@bp.get("/media/<int:media_id>/content")
@jwt_required(locations=["headers"])
def media_content(media_id):
    actor=_admin()
    if actor is None:
        return error_response("PERMISSION_DENIED","仅系统管理员可访问。",403)
    media=db.session.get(Media,media_id)
    if media is None:
        return error_response("RESOURCE_NOT_FOUND","媒体不存在。",404)
    thumbnail=(request.args.get("thumbnail") or "").strip()
    if thumbnail not in {"","0","1"}:
        return error_response("VALIDATION_ERROR","thumbnail 参数不合法。",422)
    if thumbnail=="1" and media.kind==MediaKind.LIVE_PHOTO_VIDEO:
        return error_response("VALIDATION_ERROR","视频没有缩略图。",422)
    key=(media.thumbnail_key or media.storage_key) if thumbnail=="1" else media.storage_key
    storage=get_storage()
    if not storage.exists(key):
        return error_response("RESOURCE_NOT_FOUND","媒体文件不存在。",404)
    record_admin_log(
        actor,"media.preview","media",media.id,
        after={"thumbnail":thumbnail=="1","deleted":media.deleted_at is not None},
    )
    db.session.commit()
    mimetype="image/webp" if thumbnail=="1" and media.thumbnail_key else media.mime_type
    return send_file(BytesIO(storage.read(key)),mimetype=mimetype,conditional=False,max_age=0)


def _moderate_media(media_id,status,action):
    actor=_admin(); data=request.get_json(silent=True) or {}
    if actor is None: return error_response("PERMISSION_DENIED","仅系统管理员可访问。",403)
    reason,error=_reason(data)
    if error: return error
    media=db.session.get(Media,media_id)
    if media is None or media.deleted_at is not None: return error_response("RESOURCE_NOT_FOUND","媒体不存在。",404)
    targets,target_error=_media_targets(media)
    if target_error: return target_error
    before={"status":media.status};
    for item in targets: item.status=status
    record_admin_log(actor,action,"media",media.id,before=before,after={"status":status,"pair_size":len(targets)},reason=reason)
    db.session.commit(); return success_response({"media":[_admin_media_part(m) for m in targets]})


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
    targets,target_error=_media_targets(media)
    if target_error: return target_error
    now=utcnow()
    for item in targets: item.deleted_at=now; item.status="hidden"
    record_admin_log(actor,"media.soft_delete","media",media.id,after={"deleted_at":isoformat_utc(now),"pair_size":len(targets)},reason=reason)
    db.session.commit(); return success_response({"deleted":True,"media_ids":[item.id for item in targets]})


@bp.get("/featured")
@jwt_required(locations=["headers"])
def featured_list():
    if _admin() is None: return error_response("PERMISSION_DENIED","仅系统管理员可访问。",403)
    rows=db.session.scalars(db.select(FeaturedContent).order_by(FeaturedContent.sort_order,FeaturedContent.id)).all()
    return success_response([_featured_dict(item) for item in rows])


def _featured_target(item):
    if item.content_type=="article":
        post=item.post
        return ({
            "id":item.post_id,"title":post.title if post else None,
            "author":post.author.public_dict() if post and post.author else None,
            "status":post.status if post else None,
            "moderation_status":post.moderation_status if post else None,
            "visibility":post.visibility if post else None,
            "deleted_at":isoformat_utc(post.deleted_at) if post else None,
        } if post else None)
    collection=item.collection
    return ({
        "id":item.collection_id,"name":collection.name if collection else None,
        "slug":collection.slug if collection else None,
        "creator":collection.creator.public_dict() if collection and collection.creator else None,
        "status":collection.status if collection else None,
        "deleted_at":isoformat_utc(collection.deleted_at) if collection else None,
    } if collection else None)


def _featured_is_eligible(item):
    if item.content_type=="article":
        post=item.post
        return bool(
            post and post.post_type==PostType.ARTICLE.value
            and post.status==PostStatus.PUBLISHED.value
            and post.moderation_status==PostModerationStatus.ACTIVE.value
            and post.deleted_at is None
        )
    collection=item.collection
    return bool(collection and collection.status==CollectionStatus.ACTIVE.value and collection.deleted_at is None)


def _featured_dict(item):
    creator=db.session.get(User,item.created_by_id)
    return {
        "id":item.id,"content_type":item.content_type,
        "post_id":item.post_id,"collection_id":item.collection_id,
        "sort_order":item.sort_order,"is_active":item.is_active,
        "eligible":_featured_is_eligible(item),"target":_featured_target(item),
        "created_by":creator.public_dict() if creator else None,
        "created_at":isoformat_utc(item.created_at),"updated_at":isoformat_utc(item.updated_at),
    }


@bp.post("/featured")
@jwt_required(locations=["headers"])
def create_featured():
    actor=_admin(); data=request.get_json(silent=True) or {}
    if actor is None: return error_response("PERMISSION_DENIED","仅系统管理员可访问。",403)
    if not isinstance(data,dict):
        return error_response("VALIDATION_ERROR","请求体必须是 JSON 对象。",422)
    if set(data)-{"content_type","post_id","collection_id","sort_order","reason"}:
        return error_response("VALIDATION_ERROR","包含不支持的精选字段。",422)
    reason,error=_reason(data)
    if error: return error
    content_type=data.get("content_type")
    post_id=data.get("post_id"); collection_id=data.get("collection_id")
    if content_type=="article":
        post=db.session.get(Post,post_id) if isinstance(post_id,int) and not isinstance(post_id,bool) else None
        if collection_id is not None or post is None or post.post_type!="article" or post.status!="published" or post.moderation_status!="active" or post.deleted_at is not None:
            return error_response("VALIDATION_ERROR","精选 Article 不合法。",422)
        collection_id=None
    elif content_type=="collection":
        collection=db.session.get(Collection,collection_id) if isinstance(collection_id,int) and not isinstance(collection_id,bool) else None
        if post_id is not None or collection is None or collection.status!="active" or collection.deleted_at is not None:
            return error_response("VALIDATION_ERROR","精选 Collection 不合法。",422)
        post_id=None
    else: return error_response("VALIDATION_ERROR","content_type 不合法。",422)
    sort_order=data.get("sort_order",0)
    if isinstance(sort_order,bool) or not isinstance(sort_order,int):
        return error_response("VALIDATION_ERROR","sort_order 不合法。",422)
    item=FeaturedContent(content_type=content_type,post_id=post_id,collection_id=collection_id,sort_order=sort_order,created_by_id=actor.id)
    db.session.add(item)
    try:
        db.session.flush(); record_admin_log(actor,"featured.create","featured",item.id,after={"content_type":content_type,"post_id":post_id,"collection_id":collection_id,"sort_order":sort_order,"is_active":True},reason=reason); db.session.commit()
    except IntegrityError:
        db.session.rollback(); return error_response("DUPLICATE_RESOURCE","该内容已经精选。",409)
    return success_response(_featured_dict(item),201)


@bp.patch("/featured/<int:item_id>")
@jwt_required(locations=["headers"])
def update_featured(item_id):
    actor=_admin(); data=request.get_json(silent=True)
    if actor is None: return error_response("PERMISSION_DENIED","仅系统管理员可访问。",403)
    if not isinstance(data,dict): return error_response("VALIDATION_ERROR","请求体必须是 JSON 对象。",422)
    if set(data)-{"sort_order","is_active","reason"} or not ({"sort_order","is_active"}&set(data)):
        return error_response("VALIDATION_ERROR","精选更新字段不合法。",422)
    reason,error=_reason(data)
    if error: return error
    item=db.session.get(FeaturedContent,item_id)
    if item is None: return error_response("RESOURCE_NOT_FOUND","精选项不存在。",404)
    before={"sort_order":item.sort_order,"is_active":item.is_active}
    if "sort_order" in data:
        if isinstance(data["sort_order"],bool) or not isinstance(data["sort_order"],int):
            return error_response("VALIDATION_ERROR","sort_order 不合法。",422)
        item.sort_order=data["sort_order"]
    if "is_active" in data:
        if not isinstance(data["is_active"],bool): return error_response("VALIDATION_ERROR","is_active 不合法。",422)
        if data["is_active"] and not _featured_is_eligible(item):
            return error_response("VALIDATION_ERROR","精选目标当前不可启用。",422)
        item.is_active=data["is_active"]
    record_admin_log(actor,"featured.update","featured",item.id,before=before,after={"sort_order":item.sort_order,"is_active":item.is_active},reason=reason)
    db.session.commit(); return success_response(_featured_dict(item))


@bp.delete("/featured/<int:item_id>")
@jwt_required(locations=["headers"])
def delete_featured(item_id):
    actor=_admin(); data=request.get_json(silent=True) or {}
    if actor is None: return error_response("PERMISSION_DENIED","仅系统管理员可访问。",403)
    reason,error=_reason(data)
    if error: return error
    item=db.session.get(FeaturedContent,item_id)
    if item is None: return error_response("RESOURCE_NOT_FOUND","精选项不存在。",404)
    record_admin_log(actor,"featured.delete","featured",item.id,before={"content_type":item.content_type,"post_id":item.post_id,"collection_id":item.collection_id,"sort_order":item.sort_order,"is_active":item.is_active},reason=reason)
    db.session.delete(item); db.session.commit(); return success_response({"deleted":True})


@bp.get("/settings")
@jwt_required(locations=["headers"])
def settings():
    if _admin() is None: return error_response("PERMISSION_DENIED","仅系统管理员可访问。",403)
    return success_response(_site_settings_payload())


def _site_settings_payload():
    rows=list(db.session.scalars(db.select(SiteSetting).order_by(SiteSetting.key)).all())
    stored={row.key:row.value for row in rows}
    values={item["key"]:stored.get(item["key"],item["default"]) for item in SITE_SETTING_SCHEMA}
    updated=max((row.updated_at for row in rows),default=None)
    return {"settings":values,"schema":[dict(item) for item in SITE_SETTING_SCHEMA],"updated_at":isoformat_utc(updated)}


@bp.put("/settings")
@jwt_required(locations=["headers"])
def update_settings():
    actor=_admin(); data=request.get_json(silent=True)
    if actor is None: return error_response("PERMISSION_DENIED","仅系统管理员可访问。",403)
    if not isinstance(data,dict) or not isinstance(data.get("settings"),dict):
        return error_response("VALIDATION_ERROR","settings 必须是对象。",422)
    if set(data)-{"settings","reason"}:
        return error_response("VALIDATION_ERROR","包含不支持的站点设置字段。",422)
    reason,error=_reason(data)
    if error: return error
    specs={item["key"]:item for item in SITE_SETTING_SCHEMA}
    if not data["settings"] or set(data["settings"])-set(specs):
        return error_response("VALIDATION_ERROR","包含不支持的站点设置。",422)
    current=_site_settings_payload()["settings"]
    normalized={}
    for key,value in data["settings"].items():
        spec=specs[key]
        if not isinstance(value,str):
            return error_response("VALIDATION_ERROR",f"{key} 必须是字符串。",422)
        value=value.strip()
        if spec["required"] and not value:
            return error_response("VALIDATION_ERROR",f"{key} 不能为空。",422)
        if len(value)>spec["max_length"]:
            return error_response("VALIDATION_ERROR",f"{key} 超过长度限制。",422)
        normalized[key]=value
    before={key:current[key] for key in normalized}
    for key,value in normalized.items():
        row=db.session.get(SiteSetting,key)
        if row is None: db.session.add(SiteSetting(key=key,value=value,updated_by_id=actor.id))
        else: row.value=value; row.updated_by_id=actor.id
    record_admin_log(actor,"settings.update","settings","site",before=before,after=normalized,reason=reason)
    db.session.commit(); return success_response(_site_settings_payload())


@bp.post("/notifications")
@jwt_required(locations=["headers"])
def system_notification():
    actor=_admin(); data=request.get_json(silent=True) or {}
    if actor is None: return error_response("PERMISSION_DENIED","仅系统管理员可访问。",403)
    if not isinstance(data,dict):
        return error_response("VALIDATION_ERROR","请求体必须是 JSON 对象。",422)
    if set(data)-{"message","user_ids","reason"}:
        return error_response("VALIDATION_ERROR","包含不支持的系统通知字段。",422)
    reason,error=_reason(data)
    if error: return error
    message=data.get("message"); user_ids=data.get("user_ids")
    if not isinstance(message,str) or not 1<=len(message.strip())<=500:
        return error_response("VALIDATION_ERROR","message 长度需为 1–500。",422)
    stmt=db.select(User.id).where(User.status==UserStatus.ACTIVE.value)
    if user_ids is not None:
        if not isinstance(user_ids,list) or not user_ids or len(user_ids)>1000 or any(
            isinstance(x,bool) or not isinstance(x,int) or x<=0 for x in user_ids
        ):
            return error_response("VALIDATION_ERROR","user_ids 不合法。",422)
        requested_ids=set(user_ids)
        stmt=stmt.where(User.id.in_(requested_ids))
    recipients=list(db.session.scalars(stmt).all())
    if user_ids is not None and len(recipients)!=len(requested_ids):
        return error_response("VALIDATION_ERROR","收件人包含不存在或不可用的账号。",422)
    db.session.add_all([Notification(user_id=user_id,actor_id=actor.id,kind="system",target_type="system",message=message.strip()) for user_id in recipients])
    scope="selected" if user_ids is not None else "all_active"
    after={"scope":scope,"recipient_count":len(recipients),"message":message.strip()}
    if user_ids is not None: after["user_ids"]=sorted(requested_ids)
    record_admin_log(actor,"notification.send","notification","system",after=after,reason=reason)
    db.session.commit(); return success_response({"scope":scope,"recipient_count":len(recipients)},201)


@bp.get("/logs")
@jwt_required(locations=["headers"])
def logs():
    if _admin() is None: return error_response("PERMISSION_DENIED","仅系统管理员可访问。",403)
    stmt=db.select(AdminLog)
    text_filters=(("action",AdminLog.action,80),("target_type",AdminLog.target_type,40),("target_id",AdminLog.target_id,100),("request_id",AdminLog.request_id,64))
    for key,column,max_length in text_filters:
        value=(request.args.get(key) or "").strip()
        if value:
            if len(value)>max_length:
                return error_response("VALIDATION_ERROR",f"{key} 筛选不合法。",422)
            stmt=stmt.where(column==value)
    operator_value=(request.args.get("operator_id") or "").strip()
    if operator_value:
        if not operator_value.isdigit() or int(operator_value)<=0:
            return error_response("VALIDATION_ERROR","operator_id 筛选不合法。",422)
        stmt=stmt.where(AdminLog.operator_id==int(operator_value))
    q=(request.args.get("q") or "").strip()
    if q:
        if len(q)>100:
            return error_response("VALIDATION_ERROR","日志搜索词过长。",422)
        like=f"%{q}%"
        stmt=stmt.where(or_(AdminLog.action.ilike(like),AdminLog.target_id.ilike(like),AdminLog.request_id.ilike(like),AdminLog.reason.ilike(like)))
    result=_page(stmt,(AdminLog.created_at.desc(),AdminLog.id.desc()))
    if result is None: return error_response("VALIDATION_ERROR","分页参数不合法。",422)
    rows,meta=result; return success_response([row.to_dict() for row in rows],meta=meta)
