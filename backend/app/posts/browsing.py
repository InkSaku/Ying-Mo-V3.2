import math
import re

from sqlalchemy import func
from sqlalchemy.orm import joinedload, load_only, selectinload

from app.access import is_collection_member, member_collection_ids
from app.extensions import db
from app.models import Media, MediaKind, Post, PostType, User
from app.posts.service import current_article_slug, current_article_slugs


MARKDOWN_TOKEN_RE = re.compile(r"[`*_#>\[\](){}!|~-]+")
CJK_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
LATIN_WORD_RE = re.compile(r"[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*")
BROWSE_EXCERPT_SOURCE_LIMIT = 500


def estimate_reading_minutes(body):
    """Estimate mixed Chinese/Latin Article reading time without storing derived data."""
    text = MARKDOWN_TOKEN_RE.sub(" ", body or "")
    cjk_count = len(CJK_RE.findall(text))
    latin_words = len(LATIN_WORD_RE.findall(text))
    if cjk_count == 0 and latin_words == 0:
        return 0
    return max(1, math.ceil(cjk_count / 300 + latin_words / 200))


def first_display_media(posts):
    """Return the first active visual bound to each Note, in stable binding order."""
    note_ids = [
        post.id for post in posts
        if post.post_type == PostType.NOTE.value and not _active_media(post.cover_media)
    ]
    if not note_ids:
        return {}
    rows = db.session.scalars(
        db.select(Media).where(
            Media.bound_type == "post",
            Media.bound_id.in_(note_ids),
            Media.kind.in_((MediaKind.IMAGE, MediaKind.LIVE_PHOTO_IMAGE)),
            Media.status == "active",
            Media.deleted_at.is_(None),
        ).order_by(Media.bound_id.asc(), Media.created_at.asc(), Media.id.asc())
    ).all()
    result = {}
    for media in rows:
        result.setdefault(media.bound_id, media)
    return result


def _active_media(media):
    return bool(media and media.status == "active" and media.deleted_at is None)


def _preload_browse_relations(posts):
    """Fill unloaded relationships in place, whatever the caller's query eager-loaded."""
    db.session.execute(
        db.select(Post).options(
            load_only(Post.id),
            joinedload(Post.author),
            joinedload(Post.category),
            joinedload(Post.collection),
            joinedload(Post.cover_media),
            selectinload(Post.tags),
        ).where(Post.id.in_([post.id for post in posts]))
    ).unique().scalars().all()
    db.session.scalars(
        db.select(User).options(selectinload(User.avatar_media)).where(
            User.id.in_({post.author_id for post in posts}),
        )
    ).all()


def note_visual_counts(posts):
    """Count each Note's active images and Live Photos (one per pair) for list badges."""
    note_ids = [post.id for post in posts if post.post_type == PostType.NOTE.value]
    if not note_ids:
        return {}
    rows = db.session.execute(
        db.select(Media.bound_id, func.count(Media.id)).where(
            Media.bound_type == "post",
            Media.bound_id.in_(note_ids),
            Media.kind.in_((MediaKind.IMAGE, MediaKind.LIVE_PHOTO_IMAGE)),
            Media.status == "active",
            Media.deleted_at.is_(None),
        ).group_by(Media.bound_id)
    ).all()
    return {bound_id: count for bound_id, count in rows}


def serialize_browse_post(post, *, actor_id=None, display_media=None, slugs=None, member_ids=None, visual_counts=None):
    data = post.to_dict(include_body=False)
    data["content_excerpt"] = (post.summary or post.body or "")[:BROWSE_EXCERPT_SOURCE_LIMIT]
    if post.post_type == PostType.ARTICLE.value:
        slug = slugs.get(post.id) if slugs is not None else current_article_slug(post.id)
        data["slug"] = slug or post.slug_candidate
        data["reading_minutes"] = estimate_reading_minutes(post.body)
    else:
        data["reading_minutes"] = None

    collection_visible = (
        post.collection
        and post.collection.deleted_at is None
        and (
            actor_id is None
            or (
                post.collection.id in member_ids
                if member_ids is not None
                else is_collection_member(actor_id, post.collection)
            )
        )
    )
    data["collection"] = (
        {"id": post.collection.id, "name": post.collection.name, "slug": post.collection.slug}
        if collection_visible else None
    )
    selected_media = post.cover_media if _active_media(post.cover_media) else (display_media or {}).get(post.id)
    data["display_media"] = selected_media.to_dict() if selected_media else None
    # 列表缩略图只显示第一张；随记另给出图片总数（Live Photo 按一组计），前端据此标出“共几张”。
    if post.post_type == PostType.NOTE.value and visual_counts is not None:
        data["visual_count"] = visual_counts.get(post.id, 0)
    return data


def serialize_browse_posts(posts, *, actor_id=None):
    if not posts:
        return []
    _preload_browse_relations(posts)
    media = first_display_media(posts)
    visual_counts = note_visual_counts(posts)
    slugs = current_article_slugs([post.id for post in posts if post.post_type == PostType.ARTICLE.value])
    member_ids = (
        member_collection_ids(actor_id, {post.collection for post in posts})
        if actor_id is not None else None
    )
    return [
        serialize_browse_post(post, actor_id=actor_id, display_media=media, slugs=slugs, member_ids=member_ids, visual_counts=visual_counts)
        for post in posts
    ]
