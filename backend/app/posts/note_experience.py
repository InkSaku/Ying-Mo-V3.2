from datetime import timezone

from sqlalchemy import and_, or_

from app.access import readable_post_predicate, semantic_time_expression
from app.extensions import db
from app.models import Post, PostType
from app.posts.browsing import serialize_browse_posts


NOTE_EXPERIENCE_LIMIT = 4


def _aware(value):
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=timezone.utc)


def _position(candidate, current):
    candidate_time = _aware(candidate.semantic_time)
    current_time = _aware(current.semantic_time)
    if candidate_time < current_time:
        return "before"
    if candidate_time > current_time:
        return "after"
    return "before" if candidate.id < current.id else "after"


def note_experience(post, actor_id, *, limit=NOTE_EXPERIENCE_LIMIT):
    """Return nearby ACL-safe posts from the Note's own Collection."""
    if (
        post.post_type != PostType.NOTE.value
        or post.collection_id is None
        or post.collection is None
        or post.semantic_time is None
    ):
        return None

    time_expr = semantic_time_expression()
    current_time = post.semantic_time
    base = db.select(Post).where(
        readable_post_predicate(actor_id, include_archived=True),
        Post.collection_id == post.collection_id,
        Post.id != post.id,
    )
    before = db.session.scalars(
        base.where(or_(
            time_expr < current_time,
            and_(time_expr == current_time, Post.id < post.id),
        )).order_by(time_expr.desc(), Post.id.desc()).limit(limit)
    ).all()
    after = db.session.scalars(
        base.where(or_(
            time_expr > current_time,
            and_(time_expr == current_time, Post.id > post.id),
        )).order_by(time_expr.asc(), Post.id.asc()).limit(limit)
    ).all()

    candidates = list(dict.fromkeys([*before, *after]))
    source_time = _aware(post.semantic_time)
    candidates.sort(key=lambda item: (
        abs((_aware(item.semantic_time) - source_time).total_seconds()),
        -_aware(item.semantic_time).timestamp(),
        -item.id,
    ))
    selected = candidates[:limit]
    selected.sort(key=lambda item: (_aware(item.semantic_time), item.id))

    items = serialize_browse_posts(selected, actor_id=actor_id)
    positions = {item.id: _position(item, post) for item in selected}
    for item in items:
        item["experience_position"] = positions[item["id"]]

    collection = post.collection
    cover = collection.cover_media
    cover_data = (
        cover.to_dict()
        if cover and cover.status == "active" and cover.deleted_at is None
        else None
    )
    return {
        "collection": {
            "id": collection.id,
            "name": collection.name,
            "slug": collection.slug,
            "description": collection.description,
            "cover_media": cover_data,
        },
        "items": items,
    }
