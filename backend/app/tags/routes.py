from flask import Blueprint, request
from flask_jwt_extended import jwt_required
from sqlalchemy import func

from app.access import readable_post_predicate
from app.admin.service import record_admin_log
from app.common.auth import current_user
from app.common.pagination import pagination_meta, parse_pagination
from app.common.responses import error_response, success_response
from app.extensions import db
from app.common.validation import SLUG_RE, normalize_name
from app.models import Post, Tag, UserRole, post_tags
from app.posts.service import current_article_slug

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
    items=[]
    for post in posts:
        item=post.to_dict(include_body=False)
        if post.post_type=="article": item["slug"]=current_article_slug(post.id)
        items.append(item)
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
    before=tag.to_dict()
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
        tag.is_active=data["is_active"]
    record_admin_log(actor,"tag.update","tag",tag.id,before=before,after=tag.to_dict(),reason=data.get("reason"))
    db.session.commit()
    return success_response(tag.to_dict())


@bp.post("/<int:source_id>/merge")
@jwt_required(locations=["headers"])
def merge_tag(source_id):
    actor=current_user(); data=request.get_json(silent=True) or {}
    if actor is None or actor.role!=UserRole.SYSTEM_ADMIN.value:
        return error_response("PERMISSION_DENIED","仅系统管理员可操作。",403)
    target_id=data.get("target_id")
    source=db.session.get(Tag,source_id)
    target=db.session.get(Tag,target_id) if isinstance(target_id,int) else None
    if source is None or target is None or source.id==target.id:
        return error_response("VALIDATION_ERROR","源 Tag 或目标 Tag 不合法。",422)
    posts=db.session.scalars(db.select(Post).join(post_tags).where(post_tags.c.tag_id==source.id)).unique().all()
    for post in posts:
        post.tags=[tag for tag in post.tags if tag.id!=source.id]
        if all(tag.id!=target.id for tag in post.tags):
            post.tags.append(target)
    source.is_active=False
    record_admin_log(
        actor,"tag.merge","tag",source.id,
        before={"source":source.to_dict(),"target_id":target.id},
        after={"source_active":False,"moved_posts":len(posts)},reason=data.get("reason"),
    )
    db.session.commit()
    return success_response({"source_id":source.id,"target_id":target.id,"moved_posts":len(posts)})
