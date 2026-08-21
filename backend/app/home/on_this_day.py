from datetime import datetime, timezone

from sqlalchemy import extract, func
from sqlalchemy.orm import joinedload, selectinload

from app.access import readable_post_predicate, semantic_time_expression
from app.extensions import db
from app.models import Post
from app.posts.browsing import first_display_media, serialize_browse_post


def utc_today():
    """Return the calendar day used by persisted UTC semantic timestamps."""
    return datetime.now(timezone.utc).date()


def on_this_day_data(actor_id, *, page=1, size=20, today=None):
    today = today or utc_today()
    time_expr = semantic_time_expression()
    year_expr = extract("year", time_expr)
    filters = (
        readable_post_predicate(actor_id, include_archived=True),
        extract("month", time_expr) == today.month,
        extract("day", time_expr) == today.day,
        year_expr < today.year,
    )
    stmt = db.select(Post).options(
        joinedload(Post.author),
        joinedload(Post.category),
        joinedload(Post.collection),
        joinedload(Post.cover_media),
        selectinload(Post.tags),
    ).where(*filters)
    total = db.session.scalar(
        db.select(func.count()).select_from(stmt.order_by(None).subquery())
    ) or 0
    rows = db.session.scalars(
        stmt.order_by(year_expr.desc(), time_expr.desc(), Post.id.desc())
        .offset((page - 1) * size).limit(size)
    ).all()
    display_media = first_display_media(rows)
    items = []
    for post in rows:
        item = serialize_browse_post(post, actor_id=actor_id, display_media=display_media)
        memory_year = post.semantic_time.year
        item["memory_year"] = memory_year
        item["years_ago"] = today.year - memory_year
        items.append(item)

    facet_stmt = db.select(
        year_expr.label("year"),
        func.count(Post.id).label("count"),
    ).where(*filters).group_by(year_expr).order_by(year_expr.desc())
    year_facets = [
        {
            "year": int(row.year),
            "years_ago": today.year - int(row.year),
            "count": row.count,
        }
        for row in db.session.execute(facet_stmt)
        if row.year is not None
    ]
    return {
        "date": today.isoformat(),
        "month": today.month,
        "day": today.day,
        "items": items,
        "year_facets": year_facets,
    }, total
