from flask import Blueprint
from flask_jwt_extended import jwt_required
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from app.access import can_read_post, readable_post_predicate
from app.common.auth import current_user
from app.common.pagination import pagination_meta, parse_pagination
from app.common.responses import error_response, success_response
from app.extensions import db
from app.models import ContentFavorite, ContentLike, Post

bp=Blueprint("interactions",__name__)


def _toggle(model,actor_id,post_id):
    existing=db.session.scalar(db.select(model).where(model.user_id==actor_id,model.post_id==post_id))
    if existing:
        db.session.delete(existing)
        active=False
    else:
        db.session.add(model(user_id=actor_id,post_id=post_id))
        active=True
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        existing=db.session.scalar(db.select(model).where(model.user_id==actor_id,model.post_id==post_id))
        active=existing is not None
    return active


@bp.post("/posts/<int:post_id>/like")
@jwt_required(locations=["headers"])
def toggle_like(post_id):
    actor=current_user(); post=db.session.get(Post,post_id)
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    if not can_read_post(actor.id,post):
        return error_response("RESOURCE_NOT_FOUND","Post 不存在。",404)
    active=_toggle(ContentLike,actor.id,post.id)
    count=db.session.scalar(db.select(func.count(ContentLike.id)).where(ContentLike.post_id==post.id)) or 0
    return success_response({"liked":active,"like_count":count})


@bp.post("/posts/<int:post_id>/favorite")
@jwt_required(locations=["headers"])
def toggle_favorite(post_id):
    actor=current_user(); post=db.session.get(Post,post_id)
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    if not can_read_post(actor.id,post):
        return error_response("RESOURCE_NOT_FOUND","Post 不存在。",404)
    active=_toggle(ContentFavorite,actor.id,post.id)
    return success_response({"favorited":active})


@bp.get("/posts/<int:post_id>")
@jwt_required(locations=["headers"])
def state(post_id):
    actor=current_user(); post=db.session.get(Post,post_id)
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    if not can_read_post(actor.id,post):
        return error_response("RESOURCE_NOT_FOUND","Post 不存在。",404)
    liked=db.session.scalar(db.select(ContentLike.id).where(ContentLike.user_id==actor.id,ContentLike.post_id==post.id)) is not None
    fav=db.session.scalar(db.select(ContentFavorite.id).where(ContentFavorite.user_id==actor.id,ContentFavorite.post_id==post.id)) is not None
    count=db.session.scalar(db.select(func.count(ContentLike.id)).where(ContentLike.post_id==post.id)) or 0
    return success_response({"liked":liked,"favorited":fav,"like_count":count})


@bp.get("/favorites")
@jwt_required(locations=["headers"])
def favorites():
    actor=current_user(); args=parse_pagination()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    if not args:
        return error_response("VALIDATION_ERROR","分页参数不合法。",422)
    page,size=args
    stmt=db.select(Post).join(ContentFavorite,ContentFavorite.post_id==Post.id).where(
            ContentFavorite.user_id==actor.id,
            readable_post_predicate(actor.id,include_archived=True),
        )
    total=db.session.scalar(db.select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows=db.session.scalars(stmt.order_by(ContentFavorite.created_at.desc()).offset((page-1)*size).limit(size)).all()
    from app.posts.service import current_article_slug
    items=[]
    for post in rows:
        item=post.to_dict(include_body=False)
        if post.post_type=="article": item["slug"]=current_article_slug(post.id)
        items.append(item)
    return success_response(items,meta=pagination_meta(page,size,total))
