from datetime import datetime

from flask import current_app
from itsdangerous import BadData, URLSafeSerializer
from sqlalchemy import and_, or_
from sqlalchemy.orm import joinedload, selectinload

from app.access import readable_post_predicate, semantic_time_expression
from app.common.time import isoformat_utc
from app.extensions import db
from app.home.on_this_day import on_this_day_data
from app.models import Post, PostStatus, PostType
from app.posts.browsing import serialize_browse_posts


FEED_TYPES = {"all", PostType.NOTE.value, PostType.ARTICLE.value}
FEED_EXCERPT_SOURCE_LIMIT = 2000


def _cursor_serializer():
    return URLSafeSerializer(current_app.config["SECRET_KEY"], salt="home-feed-v1")


def encode_feed_cursor(semantic_time, post_id, feed_type, memory_ids=()):
    return _cursor_serializer().dumps({
        "time": isoformat_utc(semantic_time),
        "id": post_id,
        "type": feed_type,
        "memory_ids": list(memory_ids),
    })


def decode_feed_cursor(value, feed_type):
    try:
        payload = _cursor_serializer().loads(value)
        timestamp = datetime.fromisoformat(str(payload["time"]).replace("Z", "+00:00"))
        post_id = int(payload["id"])
        raw_memory_ids = payload.get("memory_ids", [])
        if not isinstance(raw_memory_ids, list) or len(raw_memory_ids) > 3:
            return None
        memory_ids = tuple(int(item) for item in raw_memory_ids)
    except (BadData, KeyError, TypeError, ValueError):
        return None
    if (
        payload.get("type") != feed_type
        or post_id < 1
        or any(item < 1 for item in memory_ids)
        or len(memory_ids) != len(set(memory_ids))
    ):
        return None
    return timestamp, post_id, memory_ids


def home_feed_data(actor_id, *, feed_type="all", cursor=None, size=12):
    semantic_time = semantic_time_expression()
    statement = db.select(Post).options(
        joinedload(Post.author),
        joinedload(Post.category),
        joinedload(Post.collection),
        selectinload(Post.tags),
    ).where(
        readable_post_predicate(actor_id, include_archived=False),
        Post.status == PostStatus.PUBLISHED.value,
    )
    if feed_type != "all":
        statement = statement.where(Post.post_type == feed_type)
    memory_ids = ()
    if cursor:
        cursor_time, cursor_id, memory_ids = cursor
        statement = statement.where(or_(
            semantic_time < cursor_time,
            and_(semantic_time == cursor_time, Post.id < cursor_id),
        ))
        if memory_ids:
            statement = statement.where(Post.id.not_in(memory_ids))

    initial_all_feed = feed_type == "all" and cursor is None
    lookahead = 4 if initial_all_feed else 1
    rows = db.session.scalars(
        statement.order_by(semantic_time.desc(), Post.id.desc()).limit(size + lookahead)
    ).all()
    visible_rows = rows[:size]
    memory_interlude = None
    if initial_all_feed:
        memory_data, memory_total = on_this_day_data(
            actor_id,
            page=1,
            size=6,
            include_facets=False,
        )
        visible_ids = {post.id for post in visible_rows}
        memory_items = [
            item for item in memory_data["items"]
            if item["id"] not in visible_ids
        ][:3]
        if memory_items:
            memory_ids = tuple(item["id"] for item in memory_items)
            memory_interlude = {
                "date": memory_data["date"],
                "month": memory_data["month"],
                "day": memory_data["day"],
                "total": memory_total,
                "items": memory_items,
            }
    has_more = any(post.id not in memory_ids for post in rows[size:])
    next_cursor = None
    if has_more and visible_rows:
        last = visible_rows[-1]
        next_cursor = encode_feed_cursor(
            last.semantic_time,
            last.id,
            feed_type,
            memory_ids=memory_ids,
        )
    items = serialize_browse_posts(visible_rows, actor_id=actor_id)
    for post, item in zip(visible_rows, items, strict=True):
        item["feed_excerpt"] = (post.summary or post.body or "")[:FEED_EXCERPT_SOURCE_LIMIT]
    return {
        "items": items,
        "next_cursor": next_cursor,
        "has_more": has_more,
        "memory_interlude": memory_interlude,
    }
