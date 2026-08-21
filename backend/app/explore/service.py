import hashlib
import heapq
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import joinedload, selectinload

from app.access import collection_member_predicate, readable_post_predicate
from app.extensions import db
from app.home.on_this_day import on_this_day_data
from app.models import (
    Collection, FeaturedContent, Post, PostStatus, PostType, Tag, User, UserStatus,
    post_tags,
)
from app.posts.browsing import serialize_browse_posts


def daily_seed():
    return datetime.now(timezone.utc).date().isoformat()


def stable_pick(ids, *, seed, scope, limit):
    return heapq.nsmallest(
        limit,
        ids,
        key=lambda item_id: hashlib.sha256(
            f"{seed}:{scope}:{item_id}".encode("utf-8")
        ).digest(),
    )


def _random_posts(actor_id, post_type, seed, limit=4):
    candidate_ids = db.session.scalars(
        db.select(Post.id).where(
            readable_post_predicate(actor_id, include_archived=False),
            Post.status == PostStatus.PUBLISHED.value,
            Post.post_type == post_type,
        )
    ).all()
    selected_ids = stable_pick(
        candidate_ids, seed=seed, scope=f"post:{post_type}", limit=limit
    )
    if not selected_ids:
        return []
    rows = db.session.scalars(
        db.select(Post).options(
            joinedload(Post.author),
            joinedload(Post.category),
            joinedload(Post.collection),
            joinedload(Post.cover_media),
            selectinload(Post.tags),
        ).where(Post.id.in_(selected_ids))
    ).all()
    by_id = {post.id: post for post in rows}
    return serialize_browse_posts(
        [by_id[post_id] for post_id in selected_ids if post_id in by_id],
        actor_id=actor_id,
    )


def _featured_collections(actor_id, limit=4):
    rows = db.session.scalars(
        db.select(Collection).join(
            FeaturedContent, FeaturedContent.collection_id == Collection.id
        ).options(
            joinedload(Collection.creator), joinedload(Collection.cover_media)
        ).where(
            FeaturedContent.is_active.is_(True),
            FeaturedContent.content_type == "collection",
            collection_member_predicate(actor_id),
        ).order_by(FeaturedContent.sort_order.asc(), FeaturedContent.id.asc()).limit(limit)
    ).all()
    return [collection.to_dict() for collection in rows]


def _roaming_tags(actor_id, seed, limit=8):
    rows = db.session.execute(
        db.select(Tag.id, func.count(Post.id).label("visible_count"))
        .join(post_tags, post_tags.c.tag_id == Tag.id)
        .join(Post, Post.id == post_tags.c.post_id)
        .where(
            Tag.is_active.is_(True),
            readable_post_predicate(actor_id, include_archived=True),
        ).group_by(Tag.id)
    ).all()
    counts = {row.id: row.visible_count for row in rows}
    selected_ids = stable_pick(counts, seed=seed, scope="tag", limit=limit)
    if not selected_ids:
        return []
    tags = db.session.scalars(db.select(Tag).where(Tag.id.in_(selected_ids))).all()
    by_id = {tag.id: tag for tag in tags}
    result = []
    for tag_id in selected_ids:
        tag = by_id.get(tag_id)
        if tag is None:
            continue
        item = tag.to_dict()
        item["visible_post_count"] = counts[tag_id]
        result.append(item)
    return result


def _recent_members(actor_id, limit=6):
    users = db.session.scalars(
        db.select(User).options(joinedload(User.avatar_media)).where(
            User.status == UserStatus.ACTIVE.value,
            User.id != actor_id,
        ).order_by(User.created_at.desc(), User.id.desc()).limit(limit)
    ).all()
    return [user.public_dict() for user in users]


def explore_data(actor_id, seed):
    memories, memory_total = on_this_day_data(actor_id, page=1, size=3)
    memories["total"] = memory_total
    return {
        "seed": seed,
        "random_articles": _random_posts(actor_id, PostType.ARTICLE.value, seed),
        "random_notes": _random_posts(actor_id, PostType.NOTE.value, seed),
        "featured_collections": _featured_collections(actor_id),
        "on_this_day": memories,
        "roaming_tags": _roaming_tags(actor_id, seed),
        "recent_members": _recent_members(actor_id),
    }
