from flask import Blueprint, request
from flask_jwt_extended import jwt_required
from sqlalchemy import exists, func, or_

from app.access import collection_member_predicate, readable_post_predicate
from app.common.auth import current_user
from app.common.responses import error_response, success_response
from app.common.time import isoformat_utc
from app.extensions import db
from app.common.pagination import pagination_meta, parse_pagination
from app.models import (
    Collection, CollectionMember, Comment, ContentFavorite, Notification, Post,
    User, UserStatus,
)
from app.posts.service import current_article_slug

bp = Blueprint("users", __name__)


@bp.get("/<username>")
@jwt_required(locations=["headers"])
def profile(username):
    actor = current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    normalized = username.strip().lower()
    user = db.session.scalar(
        db.select(User).where(
            User.username_normalized == normalized,
            User.status == UserStatus.ACTIVE.value,
        )
    )
    if user is None:
        return error_response("RESOURCE_NOT_FOUND", "用户不存在。", 404)

    posts = db.session.scalars(
        db.select(Post).where(
            Post.author_id == user.id,
            readable_post_predicate(actor.id, include_archived=True),
        ).order_by(Post.published_at.desc(), Post.id.desc()).limit(20)
    ).all()
    visible_post_count = db.session.scalar(db.select(func.count(Post.id)).where(
        Post.author_id == user.id,
        readable_post_predicate(actor.id, include_archived=True),
    )) or 0
    collections = db.session.scalars(
        db.select(Collection).where(
            collection_member_predicate(actor.id),
            or_(
                Collection.creator_id == user.id,
                exists().where(
                    CollectionMember.collection_id == Collection.id,
                    CollectionMember.user_id == user.id,
                ),
            ),
        ).order_by(Collection.updated_at.desc()).limit(20)
    ).all()
    collection_scope = db.select(Collection.id).where(
        collection_member_predicate(actor.id),
        or_(
            Collection.creator_id == user.id,
            exists().where(
                CollectionMember.collection_id == Collection.id,
                CollectionMember.user_id == user.id,
            ),
        ),
    )
    visible_collection_count = db.session.scalar(
        db.select(func.count()).select_from(collection_scope.subquery())
    ) or 0

    serialized_posts = []
    for post in posts:
        item = post.to_dict(include_body=False)
        if post.post_type == "article":
            item["slug"] = current_article_slug(post.id)
        serialized_posts.append(item)
    return success_response({
        "user": user.public_dict(),
        "posts": serialized_posts,
        "collections": [c.to_dict() for c in collections],
        "visible_post_count": visible_post_count,
        "visible_collection_count": visible_collection_count,
    })


@bp.patch("/me")
@jwt_required(locations=["headers"])
def update_me():
    actor = current_user()
    data = request.get_json(silent=True) or {}
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    allowed = {"nickname", "bio", "region", "avatar_media_id"}
    unknown = set(data) - allowed
    if unknown:
        return error_response("VALIDATION_ERROR", "包含不支持的字段。", 422, details={"fields": sorted(unknown)})

    if "nickname" in data:
        value = data["nickname"]
        if not isinstance(value, str) or not value.strip() or len(value.strip()) > 50:
            return error_response("VALIDATION_ERROR", "nickname 不合法。", 422)
        actor.nickname = value.strip()
    for key, limit in (("bio", 500), ("region", 100)):
        if key in data:
            value = data[key]
            if value is not None and (not isinstance(value, str) or len(value) > limit):
                return error_response("VALIDATION_ERROR", f"{key} 不合法。", 422)
            setattr(actor, key, value.strip() if isinstance(value, str) else None)
    if "avatar_media_id" in data:
        from app.models import Media
        value = data["avatar_media_id"]
        if value is None:
            actor.avatar_media_id = None
            db.session.commit()
            return success_response(actor.self_dict())
        media = db.session.get(Media, value) if isinstance(value, int) else None
        if media is None or media.owner_id != actor.id or media.kind != "image" or (
            media.bound_type is not None and (media.bound_type != "avatar" or media.bound_id != actor.id)
        ):
            return error_response("RESOURCE_NOT_FOUND", "头像媒体不存在。", 404)
        media.bound_type = "avatar"
        media.bound_id = actor.id
        actor.avatar_media_id = media.id
    db.session.commit()
    return success_response(actor.self_dict())


@bp.get("/me/settings")
@jwt_required(locations=["headers"])
def my_settings():
    actor=current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    return success_response(actor.self_dict())


@bp.get("/me/overview")
@jwt_required(locations=["headers"])
def my_overview():
    actor=current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    my_collections=db.select(Collection.id).where(
        Collection.deleted_at.is_(None),
        or_(
            Collection.creator_id==actor.id,
            exists().where(CollectionMember.collection_id==Collection.id,CollectionMember.user_id==actor.id),
        ),
    )
    visible_favorites=db.select(Post.id).join(ContentFavorite,ContentFavorite.post_id==Post.id).where(
        ContentFavorite.user_id==actor.id,readable_post_predicate(actor.id,include_archived=True)
    )
    visible_comments=db.select(Comment.id).join(Post,Post.id==Comment.post_id).where(
        Comment.author_id==actor.id,readable_post_predicate(actor.id,include_archived=True)
    )
    return success_response({
        "user":actor.self_dict(),
        "counts":{
            "posts":db.session.scalar(db.select(func.count(Post.id)).where(Post.author_id==actor.id,Post.deleted_at.is_(None))) or 0,
            "drafts":db.session.scalar(db.select(func.count(Post.id)).where(Post.author_id==actor.id,Post.status=="draft",Post.deleted_at.is_(None))) or 0,
            "collections":db.session.scalar(db.select(func.count()).select_from(my_collections.subquery())) or 0,
            "favorites":db.session.scalar(db.select(func.count()).select_from(visible_favorites.subquery())) or 0,
            "comments":db.session.scalar(db.select(func.count()).select_from(visible_comments.subquery())) or 0,
            "unread_notifications":db.session.scalar(db.select(func.count(Notification.id)).where(Notification.user_id==actor.id,Notification.is_read.is_(False))) or 0,
        },
    })


@bp.get("/me/collections")
@jwt_required(locations=["headers"])
def my_collections():
    actor=current_user(); args=parse_pagination()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    if not args:
        return error_response("VALIDATION_ERROR","分页参数不合法。",422)
    page,size=args
    stmt=db.select(Collection).where(
        Collection.deleted_at.is_(None),
        or_(
            Collection.creator_id==actor.id,
            exists().where(CollectionMember.collection_id==Collection.id,CollectionMember.user_id==actor.id),
        ),
    )
    total=db.session.scalar(db.select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows=db.session.scalars(stmt.order_by(Collection.updated_at.desc()).offset((page-1)*size).limit(size)).all()
    return success_response([c.to_dict() for c in rows],meta=pagination_meta(page,size,total))


@bp.get("/me/comments")
@jwt_required(locations=["headers"])
def my_comments():
    actor=current_user(); args=parse_pagination()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    if not args:
        return error_response("VALIDATION_ERROR","分页参数不合法。",422)
    page,size=args
    stmt=db.select(Comment).join(Post,Post.id==Comment.post_id).where(
        Comment.author_id==actor.id,readable_post_predicate(actor.id,include_archived=True)
    )
    total=db.session.scalar(db.select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows=db.session.scalars(stmt.order_by(Comment.created_at.desc()).offset((page-1)*size).limit(size)).all()
    return success_response([{
        "id":c.id,"post_id":c.post_id,"body":"[该评论已删除]" if c.status=="deleted" else c.body,
        "status":c.status,"created_at":isoformat_utc(c.created_at),
    } for c in rows],meta=pagination_meta(page,size,total))
