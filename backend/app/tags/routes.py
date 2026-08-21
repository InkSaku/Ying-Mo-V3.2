from datetime import datetime, timezone

from flask import Blueprint, request
from flask_jwt_extended import jwt_required
from sqlalchemy import func

from app.access import readable_post_predicate
from app.admin.service import admin_reason, record_admin_log
from app.common.auth import current_user
from app.common.pagination import pagination_meta, parse_pagination
from app.common.responses import error_response, success_response
from app.extensions import db
from app.common.validation import SLUG_RE, normalize_name
from app.models import Post, Tag, UserRole, post_tags
from app.posts.browsing import serialize_browse_posts

bp=Blueprint("tags",__name__)


@bp.get("")
@jwt_required(locations=["headers"])
def list_tags():
    actor=current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    tags=db.session.scalars(db.select(Tag).where(Tag.is_active.is_(True)).order_by(Tag.name.asc())).all()
    result=[]
    for tag in tags:
        count=db.session.scalar(
            db.select(func.count(Post.id)).select_from(Post).join(post_tags,post_tags.c.post_id==Post.id).where(
                post_tags.c.tag_id==tag.id,readable_post_predicate(actor.id,include_archived=True)
            )
        ) or 0
        if count:
            item=tag.to_dict(); item["visible_post_count"]=count; result.append(item)
    return success_response(result)


@bp.get("/<slug>")
@jwt_required(locations=["headers"])
def tag_detail(slug):
    actor=current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    tag=db.session.scalar(db.select(Tag).where(Tag.slug==slug,Tag.is_active.is_(True)))
    if tag is None:
        return error_response("RESOURCE_NOT_FOUND","Tag 不存在。",404)
    args=parse_pagination()
    if not args:
        return error_response("VALIDATION_ERROR","分页参数不合法。",422)
    page,size=args
    stmt=db.select(Post).join(post_tags,post_tags.c.post_id==Post.id).where(
            post_tags.c.tag_id==tag.id,
            readable_post_predicate(actor.id,include_archived=True),
        )
    total=db.session.scalar(db.select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    if total==0:
        return error_response("RESOURCE_NOT_FOUND","Tag 不存在。",404)
    posts=db.session.scalars(stmt.order_by(Post.published_at.desc(),Post.id.desc()).offset((page-1)*size).limit(size)).all()
    items=serialize_browse_posts(posts,actor_id=actor.id)
    return success_response({
        "tag":tag.to_dict(),
        "posts":items,
        "visible_post_count":total,
    },meta=pagination_meta(page,size,total))


@bp.patch("/<int:tag_id>")
@jwt_required(locations=["headers"])
def update_tag(tag_id):
    actor=current_user(); data=request.get_json(silent=True)
    if actor is None or actor.role!=UserRole.SYSTEM_ADMIN.value:
        return error_response("PERMISSION_DENIED","仅系统管理员可操作。",403)
    if not isinstance(data,dict):
        return error_response("VALIDATION_ERROR","请求体必须是 JSON 对象。",422)
    tag=db.session.get(Tag,tag_id)
    if tag is None:
        return error_response("RESOURCE_NOT_FOUND","Tag 不存在。",404)
    allowed={"name","slug","is_active","reason"}
    if set(data)-allowed:
        return error_response("VALIDATION_ERROR","包含不支持的字段。",422)
    before=tag.to_dict(); reason=admin_reason(data,required=False)
    if "name" in data:
        value=data["name"]
        if not isinstance(value,str) or not value.strip() or len(value.strip())>80:
            return error_response("VALIDATION_ERROR","name 不合法。",422)
        normalized=normalize_name(value)
        if db.session.scalar(db.select(Tag.id).where(Tag.name_normalized==normalized,Tag.id!=tag.id)):
            return error_response("DUPLICATE_RESOURCE","Tag 名称已存在。",409)
        tag.name=value.strip(); tag.name_normalized=normalized
    if "slug" in data:
        if tag.first_used_at is not None:
            return error_response("VALIDATION_ERROR","已被发布内容使用的 Tag 不能修改 Slug。",422)
        value=data["slug"]
        if not isinstance(value,str) or not SLUG_RE.fullmatch(value.strip().lower()):
            return error_response("VALIDATION_ERROR","slug 不合法。",422)
        if db.session.scalar(db.select(Tag.id).where(Tag.slug==value.strip().lower(),Tag.id!=tag.id)):
            return error_response("DUPLICATE_RESOURCE","Tag Slug 已存在。",409)
        tag.slug=value.strip().lower()
    if "is_active" in data:
        if not isinstance(data["is_active"],bool):
            return error_response("VALIDATION_ERROR","is_active 不合法。",422)
        if data["is_active"] != tag.is_active and not reason:
            return error_response("VALIDATION_ERROR","停用或恢复 Tag 必须填写 reason。",422)
        tag.is_active=data["is_active"]
    record_admin_log(actor,"tag.update","tag",tag.id,before=before,after=tag.to_dict(),reason=reason)
    db.session.commit()
    return success_response(tag.to_dict())


@bp.post("/<int:source_id>/merge")
@jwt_required(locations=["headers"])
def merge_tag(source_id):
    actor=current_user(); data=request.get_json(silent=True) or {}
    if actor is None or actor.role!=UserRole.SYSTEM_ADMIN.value:
        return error_response("PERMISSION_DENIED","仅系统管理员可操作。",403)
    if set(data)-{"target_id","reason"}:
        return error_response("VALIDATION_ERROR","包含不支持的字段。",422)
    reason=admin_reason(data,required=True)
    if not reason:
        return error_response("VALIDATION_ERROR","合并 Tag 必须填写 reason。",422)
    target_id=data.get("target_id")
    source=db.session.get(Tag,source_id)
    target=db.session.get(Tag,target_id) if isinstance(target_id,int) and not isinstance(target_id,bool) else None
    if source is None or target is None or source.id==target.id or not target.is_active:
        return error_response("VALIDATION_ERROR","源 Tag 或目标 Tag 不合法。",422)
    posts=db.session.scalars(db.select(Post).join(post_tags).where(post_tags.c.tag_id==source.id)).unique().all()
    touched_at=datetime.now(timezone.utc)
    for post in posts:
        post.tags=[tag for tag in post.tags if tag.id!=source.id]
        if all(tag.id!=target.id for tag in post.tags):
            post.tags.append(target)
        # Tag membership is part of the editable Post aggregate. Force a scalar
        # UPDATE so SQLAlchemy checks and advances Post.edit_version as well.
        post.updated_at=touched_at
    source.is_active=False
    if target.first_used_at is None and source.first_used_at is not None:
        target.first_used_at=source.first_used_at
    record_admin_log(
        actor,"tag.merge","tag",source.id,
        before={"source":source.to_dict(),"target_id":target.id},
        after={"source_active":False,"moved_posts":len(posts)},reason=reason,
    )
    db.session.commit()
    return success_response({"source_id":source.id,"target_id":target.id,"moved_posts":len(posts)})
