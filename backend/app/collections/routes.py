from datetime import datetime, timezone

from flask import Blueprint, request
from flask_jwt_extended import jwt_required
from sqlalchemy import case, func
from sqlalchemy.exc import IntegrityError

from app.access import collection_member_predicate, is_collection_member
from app.collections.service import delete_collection, replace_members, resolve_member_ids
from app.common.auth import current_user
from app.common.pagination import pagination_meta, parse_pagination
from app.common.responses import error_response, success_response
from app.common.validation import SLUG_RE
from app.extensions import db
from app.models import Collection, CollectionMember, Media, Notification, Post, PostVisibility, User, UserStatus
from app.posts.service import DomainError
from app.posts.browsing import serialize_browse_posts

bp = Blueprint("collections", __name__)


def _handle(error):
    return error_response(error.code, error.message, error.status, details=error.details)


@bp.get("")
@jwt_required(locations=["headers"])
def list_collections():
    actor = current_user()
    args = parse_pagination()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    if not args:
        return error_response("VALIDATION_ERROR", "分页参数不合法。", 422)
    page, size = args
    stmt = db.select(Collection).where(collection_member_predicate(actor.id))
    total = db.session.scalar(db.select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.session.scalars(
        stmt.order_by(Collection.updated_at.desc(), Collection.id.desc()).offset((page - 1) * size).limit(size)
    ).all()
    return success_response([c.to_dict() for c in rows], meta=pagination_meta(page, size, total))


@bp.get("/<slug>")
@jwt_required(locations=["headers"])
def get_collection(slug):
    actor = current_user()
    collection = db.session.scalar(db.select(Collection).where(Collection.slug == slug))
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    if collection is None or not is_collection_member(actor.id, collection):
        return error_response("RESOURCE_NOT_FOUND", "Collection 不存在。", 404)
    posts = db.session.scalars(
        db.select(Post).where(
            Post.collection_id == collection.id,
            Post.deleted_at.is_(None),
            Post.moderation_status == "active",
            Post.status.in_(("published", "archived")),
        ).order_by(
            case((Post.collection_sort_order.is_not(None), 0), else_=1),
            Post.collection_sort_order.asc(),
            case(
                (Post.post_type == "note", func.coalesce(Post.occurred_at, Post.published_at)),
                else_=Post.published_at,
            ).desc(),
            Post.id.desc(),
        )
    ).all()
    data = collection.to_dict(include_members=True)
    data["posts"] = serialize_browse_posts(posts, actor_id=actor.id)
    return success_response(data)


@bp.post("")
@jwt_required(locations=["headers"])
def create_collection():
    actor = current_user()
    data = request.get_json(silent=True) or {}
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    name = data.get("name")
    slug = data.get("slug")
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 120:
        return error_response("VALIDATION_ERROR", "Collection 名称不合法。", 422)
    if not isinstance(slug, str) or not SLUG_RE.fullmatch(slug.strip().lower()):
        return error_response("VALIDATION_ERROR", "Collection Slug 不合法。", 422)
    if db.session.scalar(db.select(Collection.id).where(Collection.slug == slug.strip().lower())):
        return error_response("DUPLICATE_RESOURCE", "Collection Slug 已存在。", 409)
    description = data.get("description")
    if description is not None and (not isinstance(description, str) or len(description) > 5000):
        return error_response("VALIDATION_ERROR", "description 不合法。", 422)
    try:
        member_ids = resolve_member_ids(actor.id, data)
        collection = Collection(
            creator_id=actor.id, name=name.strip(), slug=slug.strip().lower(),
            description=description.strip() if isinstance(description, str) else None,
        )
        db.session.add(collection)
        db.session.flush()
        cover_id = data.get("cover_media_id")
        if cover_id is not None:
            media = db.session.get(Media, cover_id) if isinstance(cover_id, int) else None
            if media is None or media.owner_id != actor.id or media.kind != "image" or (
                media.bound_type is not None
                and (media.bound_type != "collection" or media.bound_id != collection.id)
            ):
                raise DomainError("RESOURCE_NOT_FOUND", "Collection 封面媒体不存在。", 404)
            media.bound_type = "collection"
            media.bound_id = collection.id
            collection.cover_media_id = media.id
        replace_members(collection, actor.id, member_ids, actor.id)
        db.session.commit()
    except (DomainError, IntegrityError) as error:
        db.session.rollback()
        if isinstance(error, IntegrityError):
            return error_response("DUPLICATE_RESOURCE", "Collection Slug 已存在。", 409)
        return _handle(error)
    return success_response(collection.to_dict(include_members=True), 201)


@bp.patch("/<int:collection_id>")
@jwt_required(locations=["headers"])
def update_collection(collection_id):
    actor = current_user()
    collection = db.session.get(Collection, collection_id)
    data = request.get_json(silent=True) or {}
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    if collection is None or collection.creator_id != actor.id or collection.deleted_at is not None:
        return error_response("RESOURCE_NOT_FOUND", "Collection 不存在。", 404)

    if "name" in data:
        name = data["name"]
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > 120:
            return error_response("VALIDATION_ERROR", "Collection 名称不合法。", 422)
        collection.name = name.strip()
    if "description" in data:
        description = data["description"]
        if description is not None and (not isinstance(description, str) or len(description) > 5000):
            return error_response("VALIDATION_ERROR", "description 不合法。", 422)
        collection.description = description.strip() if isinstance(description, str) else None
    if "slug" in data:
        if collection.first_shared_at is not None:
            return error_response("VALIDATION_ERROR", "Collection 首次共享后不能修改 Slug。", 422)
        slug = data["slug"]
        if not isinstance(slug, str) or not SLUG_RE.fullmatch(slug.strip().lower()):
            return error_response("VALIDATION_ERROR", "Collection Slug 不合法。", 422)
        occupied = db.session.scalar(db.select(Collection.id).where(Collection.slug == slug.strip().lower(), Collection.id != collection.id))
        if occupied:
            return error_response("DUPLICATE_RESOURCE", "Collection Slug 已存在。", 409)
        collection.slug = slug.strip().lower()
    if "cover_media_id" in data:
        cover_id = data["cover_media_id"]
        if cover_id is None:
            collection.cover_media_id = None
        else:
            media = db.session.get(Media, cover_id) if isinstance(cover_id, int) else None
            if media is None or media.owner_id != actor.id or media.kind != "image" or (
                media.bound_type is not None
                and (media.bound_type != "collection" or media.bound_id != collection.id)
            ):
                return error_response("RESOURCE_NOT_FOUND", "Collection 封面媒体不存在。", 404)
            media.bound_type = "collection"
            media.bound_id = collection.id
            collection.cover_media_id = media.id
    if "member_ids" in data or "select_all_members" in data:
        try:
            replace_members(collection, actor.id, resolve_member_ids(actor.id, data), actor.id)
        except DomainError as error:
            db.session.rollback()
            return _handle(error)
    db.session.commit()
    return success_response(collection.to_dict(include_members=True))


@bp.get("/<int:collection_id>/members")
@jwt_required(locations=["headers"])
def get_members(collection_id):
    actor = current_user()
    collection = db.session.get(Collection, collection_id)
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    if collection is None or not is_collection_member(actor.id, collection):
        return error_response("RESOURCE_NOT_FOUND", "Collection 不存在。", 404)
    return success_response({
        "creator": collection.creator.public_dict(),
        "members": [link.user.public_dict() for link in collection.member_links],
    })


@bp.put("/<int:collection_id>/members")
@jwt_required(locations=["headers"])
def put_members(collection_id):
    actor = current_user()
    collection = db.session.get(Collection, collection_id)
    data = request.get_json(silent=True) or {}
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    if collection is None or collection.creator_id != actor.id or collection.deleted_at is not None:
        return error_response("RESOURCE_NOT_FOUND", "Collection 不存在。", 404)
    if "member_ids" not in data and "select_all_members" not in data:
        return error_response("VALIDATION_ERROR", "member_ids 或 select_all_members 为必填项。", 422)
    try:
        changes = replace_members(collection, actor.id, resolve_member_ids(actor.id, data), actor.id)
        db.session.commit()
    except DomainError as error:
        db.session.rollback()
        return _handle(error)
    return success_response({"changes": changes, "collection": collection.to_dict(include_members=True)})


@bp.get("/member-options")
@jwt_required(locations=["headers"])
def member_options():
    actor = current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    users = db.session.scalars(
        db.select(User).where(User.status == UserStatus.ACTIVE.value, User.id != actor.id).order_by(User.nickname.asc(), User.id.asc())
    ).all()
    return success_response([u.public_dict() for u in users])


@bp.post("/<int:collection_id>/remove-post")
@jwt_required(locations=["headers"])
def remove_post(collection_id):
    actor = current_user()
    collection = db.session.get(Collection, collection_id)
    data = request.get_json(silent=True) or {}
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    if collection is None or collection.creator_id != actor.id or collection.deleted_at is not None:
        return error_response("RESOURCE_NOT_FOUND", "Collection 不存在。", 404)
    post_id = data.get("post_id")
    post = db.session.get(Post, post_id) if isinstance(post_id, int) else None
    if post is None or post.collection_id != collection.id or post.deleted_at is not None:
        return error_response("RESOURCE_NOT_FOUND", "Post 不存在。", 404)
    post.collection_id = None
    post.collection_sort_order = None
    post.visibility = PostVisibility.PRIVATE.value
    if post.author_id != actor.id:
        db.session.add(Notification(
            user_id=post.author_id, actor_id=actor.id, kind="post_removed_from_collection",
            target_type="post",
            post_id=post.id, collection_id=collection.id,
            message=f"你的 Post 已从 Collection「{collection.name}」移出。",
        ))
    db.session.commit()
    return success_response({"post_id": post.id, "visibility": post.visibility})


@bp.post("/<int:collection_id>/reorder")
@jwt_required(locations=["headers"])
def reorder(collection_id):
    actor = current_user()
    collection = db.session.get(Collection, collection_id)
    data = request.get_json(silent=True) or {}
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    if collection is None or collection.creator_id != actor.id or collection.deleted_at is not None:
        return error_response("RESOURCE_NOT_FOUND", "Collection 不存在。", 404)
    post_ids = data.get("post_ids")
    if not isinstance(post_ids, list) or len(post_ids) != len(set(post_ids)):
        return error_response("VALIDATION_ERROR", "post_ids 必须是无重复数组。", 422)
    posts = db.session.scalars(db.select(Post).where(
        Post.collection_id == collection.id,
        Post.deleted_at.is_(None),
        Post.moderation_status == "active",
        Post.status.in_(("published","archived")),
    )).all()
    actual = {p.id for p in posts}
    if set(post_ids) != actual:
        return error_response("VALIDATION_ERROR", "post_ids 必须完整覆盖 Collection 当前 Post。", 422)
    order = {pid: index for index, pid in enumerate(post_ids)}
    for post in posts:
        post.collection_sort_order = order[post.id]
    db.session.commit()
    return success_response({"post_ids": post_ids})


@bp.delete("/<int:collection_id>")
@jwt_required(locations=["headers"])
def delete(collection_id):
    actor = current_user()
    collection = db.session.get(Collection, collection_id)
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    if collection is None or collection.creator_id != actor.id or collection.deleted_at is not None:
        return error_response("RESOURCE_NOT_FOUND", "Collection 不存在。", 404)
    mode = delete_collection(collection)
    db.session.commit()
    return success_response({"deleted": True, "mode": mode})
