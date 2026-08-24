from flask import Blueprint, request
from flask_jwt_extended import jwt_required
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from app.access import can_read_post, readable_post_predicate
from app.common.auth import current_user
from app.common.pagination import pagination_meta, parse_pagination
from app.common.responses import error_response, success_response
from app.extensions import db
from app.models import Comment, CommentReaction, ContentFavorite, Post, PostReaction
from app.interactions.service import reaction_summary, set_reaction, valid_reaction_kind
from app.posts.browsing import serialize_browse_posts

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
    existing=db.session.scalar(db.select(PostReaction).where(
        PostReaction.user_id==actor.id,PostReaction.post_id==post.id,
    ))
    active=existing is None or existing.kind!="heart"
    set_reaction(
        PostReaction,PostReaction.post_id,target_id=post.id,user_id=actor.id,
        kind="heart" if active else None,
    )
    db.session.commit()
    count=db.session.scalar(db.select(func.count(PostReaction.id)).where(
        PostReaction.post_id==post.id,PostReaction.kind=="heart",
    )) or 0
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
    liked=db.session.scalar(db.select(PostReaction.id).where(
        PostReaction.user_id==actor.id,PostReaction.post_id==post.id,PostReaction.kind=="heart",
    )) is not None
    fav=db.session.scalar(db.select(ContentFavorite.id).where(ContentFavorite.user_id==actor.id,ContentFavorite.post_id==post.id)) is not None
    count=db.session.scalar(db.select(func.count(PostReaction.id)).where(
        PostReaction.post_id==post.id,PostReaction.kind=="heart",
    )) or 0
    return success_response({"liked":liked,"favorited":fav,"like_count":count})


def _reaction_kind_from_request():
    data=request.get_json(silent=True)
    if not isinstance(data,dict) or set(data)!={"kind"}:
        return None,error_response("VALIDATION_ERROR","仅支持 kind 字段。",422)
    if data["kind"] is None:
        return None,None
    kind=valid_reaction_kind(data["kind"])
    if kind is None:
        return None,error_response("VALIDATION_ERROR","回应类型不受支持。",422)
    return kind,None


@bp.get("/posts/<int:post_id>/reactions")
@jwt_required(locations=["headers"])
def post_reactions(post_id):
    actor=current_user(); post=db.session.get(Post,post_id)
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    if not can_read_post(actor.id,post):
        return error_response("RESOURCE_NOT_FOUND","Post 不存在。",404)
    return success_response(reaction_summary(
        PostReaction,PostReaction.post_id,post.id,actor_id=actor.id,
    ))


@bp.put("/posts/<int:post_id>/reaction")
@jwt_required(locations=["headers"])
def set_post_reaction(post_id):
    actor=current_user(); post=db.session.get(Post,post_id)
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    if not can_read_post(actor.id,post):
        return error_response("RESOURCE_NOT_FOUND","Post 不存在。",404)
    kind,error=_reaction_kind_from_request()
    if error:
        return error
    set_reaction(PostReaction,PostReaction.post_id,target_id=post.id,user_id=actor.id,kind=kind)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        set_reaction(PostReaction,PostReaction.post_id,target_id=post.id,user_id=actor.id,kind=kind)
        db.session.commit()
    return success_response(reaction_summary(
        PostReaction,PostReaction.post_id,post.id,actor_id=actor.id,
    ))


def _readable_active_comment(actor_id,comment_id):
    comment=db.session.get(Comment,comment_id)
    if comment is None or comment.status!="active":
        return None
    post=db.session.get(Post,comment.post_id)
    return comment if can_read_post(actor_id,post) else None


@bp.get("/comments/<int:comment_id>/reactions")
@jwt_required(locations=["headers"])
def comment_reactions(comment_id):
    actor=current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    comment=_readable_active_comment(actor.id,comment_id)
    if comment is None:
        return error_response("RESOURCE_NOT_FOUND","评论不存在。",404)
    return success_response(reaction_summary(
        CommentReaction,CommentReaction.comment_id,comment.id,actor_id=actor.id,
    ))


@bp.put("/comments/<int:comment_id>/reaction")
@jwt_required(locations=["headers"])
def set_comment_reaction(comment_id):
    actor=current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    comment=_readable_active_comment(actor.id,comment_id)
    if comment is None:
        return error_response("RESOURCE_NOT_FOUND","评论不存在。",404)
    kind,error=_reaction_kind_from_request()
    if error:
        return error
    set_reaction(
        CommentReaction,CommentReaction.comment_id,
        target_id=comment.id,user_id=actor.id,kind=kind,
    )
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        set_reaction(
            CommentReaction,CommentReaction.comment_id,
            target_id=comment.id,user_id=actor.id,kind=kind,
        )
        db.session.commit()
    return success_response(reaction_summary(
        CommentReaction,CommentReaction.comment_id,comment.id,actor_id=actor.id,
    ))


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
    items=serialize_browse_posts(rows,actor_id=actor.id)
    return success_response(items,meta=pagination_meta(page,size,total))
