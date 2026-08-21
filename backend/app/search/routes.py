from flask import Blueprint, request
from flask_jwt_extended import jwt_required
from sqlalchemy import func, or_

from app.access import collection_member_predicate, readable_post_predicate, semantic_time_expression
from app.common.auth import current_user
from app.common.pagination import pagination_meta, parse_pagination
from app.common.responses import error_response, success_response
from app.extensions import db
from app.models import Category, Collection, Post, Tag, User, UserStatus, post_tags
from app.posts.browsing import serialize_browse_posts

bp = Blueprint("search", __name__)


def _query_text():
    value = (request.args.get("q") or "").strip()
    return value if 1 <= len(value) <= 100 else None


def _post_search(actor_id, query):
    like = f"%{query}%"
    return db.select(Post).where(
        readable_post_predicate(actor_id, include_archived=True),
        or_(Post.title.ilike(like), Post.summary.ilike(like), Post.body.ilike(like)),
    )


@bp.get("")
@jwt_required(locations=["headers"])
def search():
    actor = current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    q = _query_text()
    args = parse_pagination(default_size=20, max_size=50)
    if q is None:
        return error_response("VALIDATION_ERROR", "q 长度需为 1–100。", 422)
    if not args:
        return error_response("VALIDATION_ERROR", "分页参数不合法。", 422)
    page, size = args
    like = f"%{q}%"
    post_stmt = _post_search(actor.id, q)
    total = db.session.scalar(db.select(func.count()).select_from(post_stmt.order_by(None).subquery())) or 0
    posts = db.session.scalars(
        post_stmt.order_by(semantic_time_expression().desc(), Post.id.desc())
        .offset((page - 1) * size).limit(size)
    ).all()
    collections = db.session.scalars(
        db.select(Collection).where(
            collection_member_predicate(actor.id),
            or_(Collection.name.ilike(like), Collection.description.ilike(like)),
        ).order_by(Collection.updated_at.desc()).limit(20)
    ).all()
    users = db.session.scalars(
        db.select(User).where(
            User.status == UserStatus.ACTIVE.value,
            or_(User.username_normalized.ilike(like), User.nickname.ilike(like)),
        ).order_by(User.nickname.asc(), User.id.asc()).limit(20)
    ).all()

    category_rows = db.session.execute(
        db.select(Category.id, Category.name, Category.slug, func.count(Post.id).label("count"))
        .join(Post, Post.category_id == Category.id)
        .where(
            readable_post_predicate(actor.id, include_archived=True),
            or_(Post.title.ilike(like), Post.summary.ilike(like), Post.body.ilike(like)),
            Category.is_active.is_(True),
        ).group_by(Category.id, Category.name, Category.slug).order_by(func.count(Post.id).desc()).limit(20)
    ).all()
    tag_rows = db.session.execute(
        db.select(Tag.id, Tag.name, Tag.slug, func.count(Post.id).label("count"))
        .join(post_tags, post_tags.c.tag_id == Tag.id)
        .join(Post, Post.id == post_tags.c.post_id)
        .where(
            readable_post_predicate(actor.id, include_archived=True),
            or_(Post.title.ilike(like), Post.summary.ilike(like), Post.body.ilike(like)),
            Tag.is_active.is_(True),
        ).group_by(Tag.id, Tag.name, Tag.slug).order_by(func.count(Post.id).desc()).limit(20)
    ).all()
    return success_response({
        "posts": serialize_browse_posts(posts, actor_id=actor.id),
        "collections": [collection.to_dict() for collection in collections],
        "users": [user.public_dict() for user in users],
        "category_facets": [dict(row._mapping) for row in category_rows],
        "tag_facets": [dict(row._mapping) for row in tag_rows],
    }, meta=pagination_meta(page, size, total))


@bp.get("/suggestions")
@jwt_required(locations=["headers"])
def suggestions():
    actor = current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    q = _query_text()
    if q is None:
        return error_response("VALIDATION_ERROR", "q 长度需为 1–100。", 422)
    like = f"%{q}%"
    titles = db.session.scalars(
        db.select(Post.title).where(
            readable_post_predicate(actor.id, include_archived=True),
            Post.title.is_not(None),
            Post.title.ilike(like),
        ).distinct().order_by(Post.title.asc()).limit(10)
    ).all()
    collections = db.session.scalars(
        db.select(Collection.name).where(
            collection_member_predicate(actor.id), Collection.name.ilike(like)
        ).distinct().order_by(Collection.name.asc()).limit(10)
    ).all()
    return success_response({"post_titles": titles, "collection_names": collections})
