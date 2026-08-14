from flask import Blueprint, request
from flask_jwt_extended import jwt_required
from sqlalchemy import func, or_

from app.access import readable_post_predicate
from app.admin.service import record_admin_log
from app.common.auth import current_user
from app.common.pagination import pagination_meta, parse_pagination
from app.common.responses import error_response, success_response
from app.common.validation import SLUG_RE, normalize_name
from app.extensions import db
from app.models import Category, Post, UserRole
from app.posts.service import current_article_slug

bp=Blueprint("categories",__name__)


@bp.get("")
@jwt_required(locations=["headers"])
def list_categories():
    actor=current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    categories=db.session.scalars(db.select(Category).where(Category.is_active.is_(True)).order_by(Category.sort_order,Category.name)).all()
    result=[]
    for c in categories:
        count=db.session.scalar(db.select(func.count(Post.id)).where(Post.category_id==c.id,readable_post_predicate(actor.id,include_archived=True))) or 0
        if count:
            item=c.to_dict(); item["visible_post_count"]=count; result.append(item)
    return success_response(result)


@bp.post("")
@jwt_required(locations=["headers"])
def create_category():
    actor=current_user(); data=request.get_json(silent=True) or {}
    if actor is None or actor.role!=UserRole.SYSTEM_ADMIN.value:
        return error_response("PERMISSION_DENIED","仅系统管理员可操作。",403)
    name=data.get("name"); slug=data.get("slug")
    if not isinstance(name,str) or not name.strip() or not isinstance(slug,str) or not SLUG_RE.fullmatch(slug.strip().lower()):
        return error_response("VALIDATION_ERROR","Category 名称或 Slug 不合法。",422)
    if db.session.scalar(db.select(Category.id).where(or_(Category.name_normalized==normalize_name(name),Category.slug==slug.strip().lower()))):
        return error_response("DUPLICATE_RESOURCE","Category 已存在。",409)
    description=data.get("description")
    if description is not None and (not isinstance(description,str) or len(description)>500):
        return error_response("VALIDATION_ERROR","description 不合法。",422)
    c=Category(
        name=name.strip(),name_normalized=normalize_name(name),slug=slug.strip().lower(),
        description=description.strip() if isinstance(description,str) else None,
        sort_order=data.get("sort_order",0) if isinstance(data.get("sort_order",0),int) else 0,
    )
    db.session.add(c); db.session.flush()
    record_admin_log(actor,"category.create","category",c.id,after=c.to_dict(),reason=data.get("reason"))
    db.session.commit()
    return success_response(c.to_dict(),201)


@bp.patch("/<int:category_id>")
@jwt_required(locations=["headers"])
def update_category(category_id):
    actor=current_user(); data=request.get_json(silent=True)
    if actor is None or actor.role!=UserRole.SYSTEM_ADMIN.value:
        return error_response("PERMISSION_DENIED","仅系统管理员可操作。",403)
    if not isinstance(data,dict):
        return error_response("VALIDATION_ERROR","请求体必须是 JSON 对象。",422)
    category=db.session.get(Category,category_id)
    if category is None:
        return error_response("RESOURCE_NOT_FOUND","Category 不存在。",404)
    allowed={"name","slug","description","sort_order","is_active","reason"}
    if set(data)-allowed:
        return error_response("VALIDATION_ERROR","包含不支持的字段。",422)
    before=category.to_dict()
    if "name" in data:
        value=data["name"]
        if not isinstance(value,str) or not value.strip() or len(value.strip())>100:
            return error_response("VALIDATION_ERROR","name 不合法。",422)
        normalized=normalize_name(value)
        if db.session.scalar(db.select(Category.id).where(Category.name_normalized==normalized,Category.id!=category.id)):
            return error_response("DUPLICATE_RESOURCE","Category 名称已存在。",409)
        category.name=value.strip(); category.name_normalized=normalized
    if "slug" in data:
        if category.first_used_at is not None:
            return error_response("VALIDATION_ERROR","已被发布内容使用的 Category 不能修改 Slug。",422)
        value=data["slug"]
        if not isinstance(value,str) or not SLUG_RE.fullmatch(value.strip().lower()):
            return error_response("VALIDATION_ERROR","slug 不合法。",422)
        if db.session.scalar(db.select(Category.id).where(Category.slug==value.strip().lower(),Category.id!=category.id)):
            return error_response("DUPLICATE_RESOURCE","Category Slug 已存在。",409)
        category.slug=value.strip().lower()
    if "description" in data:
        value=data["description"]
        if value is not None and (not isinstance(value,str) or len(value)>500):
            return error_response("VALIDATION_ERROR","description 不合法。",422)
        category.description=value.strip() if isinstance(value,str) else None
    if "sort_order" in data:
        if isinstance(data["sort_order"],bool) or not isinstance(data["sort_order"],int):
            return error_response("VALIDATION_ERROR","sort_order 不合法。",422)
        category.sort_order=data["sort_order"]
    if "is_active" in data:
        if not isinstance(data["is_active"],bool):
            return error_response("VALIDATION_ERROR","is_active 不合法。",422)
        category.is_active=data["is_active"]
    record_admin_log(actor,"category.update","category",category.id,before=before,after=category.to_dict(),reason=data.get("reason"))
    db.session.commit()
    return success_response(category.to_dict())


@bp.get("/<slug>")
@jwt_required(locations=["headers"])
def category_detail(slug):
    actor=current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    category=db.session.scalar(db.select(Category).where(Category.slug==slug,Category.is_active.is_(True)))
    if category is None:
        return error_response("RESOURCE_NOT_FOUND","Category 不存在。",404)
    args=parse_pagination()
    if not args:
        return error_response("VALIDATION_ERROR","分页参数不合法。",422)
    page,size=args
    stmt=db.select(Post).where(
            Post.category_id==category.id,
            readable_post_predicate(actor.id,include_archived=True),
        )
    total=db.session.scalar(db.select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    posts=db.session.scalars(stmt.order_by(Post.published_at.desc(),Post.id.desc()).offset((page-1)*size).limit(size)).all()
    items=[]
    for post in posts:
        item=post.to_dict(include_body=False)
        if post.post_type=="article": item["slug"]=current_article_slug(post.id)
        items.append(item)
    return success_response({
        "category":category.to_dict(),
        "posts":items,
        "visible_post_count":total,
    },meta=pagination_meta(page,size,total))
