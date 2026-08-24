from datetime import datetime, timezone

from sqlalchemy import extract, func
from sqlalchemy.orm import joinedload, selectinload

from app.access import readable_post_predicate, semantic_time_expression
from app.extensions import db
from app.models import Collection, Media, Post
from app.posts.browsing import serialize_browse_posts


def current_year():
    return datetime.now(timezone.utc).year


def year_review_data(actor_id, year):
    time_expr = semantic_time_expression()
    filters = (
        Post.author_id == actor_id,
        Post.status.in_(("published", "archived")),
        Post.deleted_at.is_(None),
        readable_post_predicate(actor_id, include_archived=True),
        extract("year", time_expr) == year,
    )
    posts = db.session.scalars(
        db.select(Post).options(
            joinedload(Post.author),
            joinedload(Post.category),
            joinedload(Post.collection),
            joinedload(Post.cover_media),
            selectinload(Post.tags),
        ).where(*filters).order_by(time_expr.desc(), Post.id.desc())
    ).all()
    post_ids = [post.id for post in posts]
    months = {month: {"article": 0, "note": 0, "total": 0} for month in range(1, 13)}
    locations = []
    seen_locations = set()
    collection_counts = {}
    article_count = 0
    note_count = 0
    for post in posts:
        month = post.semantic_time.month
        months[month][post.post_type] += 1
        months[month]["total"] += 1
        if post.post_type == "article":
            article_count += 1
        else:
            note_count += 1
        if post.location and post.location not in seen_locations:
            seen_locations.add(post.location)
            locations.append(post.location)
        if post.collection_id and post.collection:
            item = collection_counts.setdefault(post.collection_id, {
                "id": post.collection.id,
                "name": post.collection.name,
                "slug": post.collection.slug,
                "count": 0,
            })
            item["count"] += 1
    media_count = db.session.scalar(db.select(func.count(Media.id)).where(
        Media.bound_type == "post",
        Media.bound_id.in_(post_ids) if post_ids else db.false(),
        Media.kind.in_(("image", "live_photo_image")),
        Media.status == "active",
        Media.deleted_at.is_(None),
    )) or 0
    return {
        "year": year,
        "summary": {
            "total": len(posts),
            "articles": article_count,
            "notes": note_count,
            "media": media_count,
            "active_months": sum(1 for item in months.values() if item["total"]),
            "locations": len(locations),
            "collections": len(collection_counts),
        },
        "months": [{"month": month, **counts} for month, counts in months.items()],
        "locations": locations[:30],
        "collections": sorted(collection_counts.values(), key=lambda item: (-item["count"], item["id"])),
        "highlights": serialize_browse_posts(posts[:12], actor_id=actor_id),
    }
