import math
import re

from app.access import is_collection_member
from app.extensions import db
from app.models import Media, MediaKind, PostType
from app.posts.service import current_article_slug


MARKDOWN_TOKEN_RE = re.compile(r"[`*_#>\[\](){}!|~-]+")
CJK_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
LATIN_WORD_RE = re.compile(r"[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*")


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


def serialize_browse_post(post, *, actor_id=None, display_media=None):
    data = post.to_dict(include_body=False)
    if post.post_type == PostType.ARTICLE.value:
        data["slug"] = current_article_slug(post.id) or post.slug_candidate
        data["reading_minutes"] = estimate_reading_minutes(post.body)
    else:
        data["reading_minutes"] = None

    collection_visible = (
        post.collection
        and post.collection.deleted_at is None
        and (actor_id is None or is_collection_member(actor_id, post.collection))
    )
    data["collection"] = (
        {"id": post.collection.id, "name": post.collection.name, "slug": post.collection.slug}
        if collection_visible else None
    )
    selected_media = post.cover_media if _active_media(post.cover_media) else (display_media or {}).get(post.id)
    data["display_media"] = selected_media.to_dict() if selected_media else None
    return data


def serialize_browse_posts(posts, *, actor_id=None):
    media = first_display_media(posts)
    return [serialize_browse_post(post, actor_id=actor_id, display_media=media) for post in posts]
