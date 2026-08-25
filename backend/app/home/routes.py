from datetime import datetime, timezone

from flask import Blueprint, request
from flask_jwt_extended import jwt_required
from sqlalchemy import func
from sqlalchemy.orm import joinedload, selectinload

from app.access import collection_member_predicate, readable_post_predicate
from app.common.auth import current_user
from app.common.pagination import pagination_meta, parse_pagination
from app.common.responses import error_response, success_response
from app.extensions import db
from app.models import Collection, FeaturedContent, Post, PostStatus, PostType
from app.posts.browsing import serialize_browse_posts
from app.home.on_this_day import on_this_day_data
from app.home.year_review import year_review_data
from app.home.feed import FEED_TYPES, decode_feed_cursor, home_feed_data

bp=Blueprint("home",__name__)


def _post_items(actor_id,post_type,limit=6):
    rows=db.session.scalars(
        db.select(Post).options(
            joinedload(Post.author), joinedload(Post.category), joinedload(Post.collection), selectinload(Post.tags)
        ).where(
            readable_post_predicate(actor_id,include_archived=False),
            Post.status==PostStatus.PUBLISHED.value,
            Post.post_type==post_type,
        ).order_by(
            (func.coalesce(Post.occurred_at,Post.published_at) if post_type==PostType.NOTE.value else Post.published_at).desc(),
            Post.id.desc(),
        ).limit(limit)
    ).all()
    return serialize_browse_posts(rows,actor_id=actor_id)


@bp.get("")
@jwt_required(locations=["headers"])
def home():
    actor=current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    collections=db.session.scalars(
        db.select(Collection).options(joinedload(Collection.creator)).where(
            collection_member_predicate(actor.id)
        ).order_by(Collection.updated_at.desc()).limit(6)
    ).all()
    featured_articles=db.session.scalars(
        db.select(Post).join(FeaturedContent,FeaturedContent.post_id==Post.id).options(
            joinedload(Post.author),joinedload(Post.category),joinedload(Post.collection),selectinload(Post.tags)
        ).where(
            FeaturedContent.is_active.is_(True),
            FeaturedContent.content_type=="article",
            Post.post_type==PostType.ARTICLE.value,
            Post.status==PostStatus.PUBLISHED.value,
            readable_post_predicate(actor.id,include_archived=False),
        ).order_by(FeaturedContent.sort_order.asc(),FeaturedContent.id.asc()).limit(6)
    ).all()
    featured_collections=db.session.scalars(
        db.select(Collection).join(
            FeaturedContent,FeaturedContent.collection_id==Collection.id
        ).options(joinedload(Collection.creator)).where(
            FeaturedContent.is_active.is_(True),
            FeaturedContent.content_type=="collection",
            collection_member_predicate(actor.id),
        ).order_by(FeaturedContent.sort_order.asc(),FeaturedContent.id.asc()).limit(6)
    ).all()
    featured_article_items=serialize_browse_posts(featured_articles,actor_id=actor.id)
    on_this_day, on_this_day_total = on_this_day_data(actor.id, page=1, size=4)
    on_this_day["total"] = on_this_day_total
    return success_response({
        "featured_articles":featured_article_items,
        "featured_collections":[c.to_dict() for c in featured_collections],
        "recent_articles":_post_items(actor.id,PostType.ARTICLE.value),
        "recent_notes":_post_items(actor.id,PostType.NOTE.value),
        "collections":[c.to_dict() for c in collections],
        "on_this_day":on_this_day,
    })


@bp.get("/feed")
@jwt_required(locations=["headers"])
def home_feed():
    actor = current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)

    feed_type = request.args.get("type", "all").strip().lower()
    if feed_type not in FEED_TYPES:
        return error_response("VALIDATION_ERROR", "type 不合法。", 422)
    try:
        size = int(request.args.get("page_size", "12"))
    except ValueError:
        return error_response("VALIDATION_ERROR", "page_size 不合法。", 422)
    if size < 1 or size > 30:
        return error_response("VALIDATION_ERROR", "page_size 不合法。", 422)

    raw_cursor = request.args.get("cursor", "").strip()
    cursor = decode_feed_cursor(raw_cursor, feed_type) if raw_cursor else None
    if raw_cursor and cursor is None:
        return error_response("VALIDATION_ERROR", "cursor 不合法或与当前筛选不匹配。", 422)
    return success_response(home_feed_data(
        actor.id,
        feed_type=feed_type,
        cursor=cursor,
        size=size,
    ))


@bp.get("/on-this-day")
@jwt_required(locations=["headers"])
def on_this_day():
    actor = current_user()
    args = parse_pagination(default_size=20, max_size=50)
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    if not args:
        return error_response("VALIDATION_ERROR", "分页参数不合法。", 422)
    page, size = args
    data, total = on_this_day_data(actor.id, page=page, size=size)
    return success_response(data, meta=pagination_meta(page, size, total))


@bp.get("/year-in-review")
@jwt_required(locations=["headers"])
def year_in_review():
    actor = current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    current = datetime.now(timezone.utc).year
    raw_year = request.args.get("year", str(current)).strip()
    try:
        year = int(raw_year)
    except ValueError:
        return error_response("VALIDATION_ERROR", "year 不合法。", 422)
    if year < 2000 or year > current:
        return error_response("VALIDATION_ERROR", "year 不合法。", 422)
    return success_response(year_review_data(actor.id, year))
