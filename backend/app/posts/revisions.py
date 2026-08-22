from app.access import is_collection_member
from app.common.markdown import render_safe_markdown_document
from app.common.validation import parse_iso_datetime
from app.extensions import db
from app.models import Category, Collection, Media, PostRevision, PostVisibility, Tag
from app.posts.service import DomainError, current_article_slug, update_article_slug


SNAPSHOT_FIELDS = (
    "title", "summary", "body", "content_format", "cover_media_id", "category_id",
    "tag_ids", "collection_id", "visibility", "occurred_at", "location", "mood",
    "external_video_url", "slug",
)


def snapshot_post(post):
    with db.session.no_autoflush:
        slug = current_article_slug(post.id) if post.post_type == "article" else None
        tags = sorted(post.tags, key=lambda tag: tag.id)
    return {
        "post_type": post.post_type,
        "title": post.title,
        "summary": post.summary,
        "body": post.body,
        "content_format": post.content_format,
        "cover_media_id": post.cover_media_id,
        "category_id": post.category_id,
        "category": (
            {"id": post.category.id, "name": post.category.name, "slug": post.category.slug}
            if post.category else None
        ),
        "tag_ids": [tag.id for tag in tags],
        "tags": [
            {"id": tag.id, "name": tag.name, "slug": tag.slug}
            for tag in tags
        ],
        # Collection names remain governed by current membership and are resolved at read time.
        "collection_id": post.collection_id,
        "visibility": post.visibility,
        "occurred_at": post.to_dict(include_body=False)["occurred_at"],
        "location": post.location,
        "mood": post.mood,
        "external_video_url": post.external_video_url,
        "slug": slug,
    }


def changed_snapshot_fields(before, after):
    return [field for field in SNAPSHOT_FIELDS if before.get(field) != after.get(field)]


def create_revision(post, snapshot, changed_fields, *, reason="manual_edit", source_edit_version=None):
    if not changed_fields:
        return None
    revision = PostRevision(
        post_id=post.id,
        author_id=post.author_id,
        source_edit_version=source_edit_version or post.edit_version,
        reason=reason,
        snapshot=snapshot,
        changed_fields=changed_fields,
    )
    db.session.add(revision)
    return revision


def revision_detail(revision, actor_id):
    data = revision.summary_dict()
    snapshot = dict(revision.snapshot or {})
    collection = None
    collection_id = snapshot.get("collection_id")
    if collection_id:
        candidate = db.session.get(Collection, collection_id)
        if candidate is not None and is_collection_member(actor_id, candidate):
            collection = {"id": candidate.id, "name": candidate.name, "slug": candidate.slug}
    snapshot["collection"] = collection
    snapshot["collection_unavailable"] = bool(collection_id and collection is None)
    snapshot["rendered_html"] = render_safe_markdown_document(snapshot.get("body"))["html"]
    media = db.session.scalars(
        db.select(Media).where(
            Media.bound_type == "post",
            Media.bound_id == revision.post_id,
            Media.status == "active",
            Media.deleted_at.is_(None),
        ).order_by(Media.created_at.asc(), Media.id.asc())
    ).all()
    snapshot["bound_media"] = [item.to_dict(include_manage_paths=True) for item in media]
    data["snapshot"] = snapshot
    return data


def restore_revision_snapshot(post, revision, actor):
    snapshot = revision.snapshot or {}
    if snapshot.get("post_type") != post.post_type:
        raise DomainError("REVISION_INVALID", "历史版本类型与当前内容不一致。", 409)

    warnings = []
    for field in ("title", "summary", "body", "content_format", "location", "mood", "external_video_url"):
        setattr(post, field, snapshot.get(field))
    occurred_at = snapshot.get("occurred_at")
    post.occurred_at = parse_iso_datetime(occurred_at) if occurred_at else None

    category_id = snapshot.get("category_id")
    category = db.session.get(Category, category_id) if category_id else None
    if category_id and (category is None or not category.is_active):
        warnings.append("原 Category 已不可用，恢复时已清除。")
        category = None
    post.category = category

    tag_ids = [item for item in snapshot.get("tag_ids", []) if isinstance(item, int)]
    tags = db.session.scalars(
        db.select(Tag).where(Tag.id.in_(tag_ids), Tag.is_active.is_(True))
    ).all() if tag_ids else []
    tags_by_id = {tag.id: tag for tag in tags}
    post.tags = [tags_by_id[tag_id] for tag_id in tag_ids if tag_id in tags_by_id]
    if len(post.tags) != len(tag_ids):
        warnings.append("部分原 Tag 已不可用，恢复时已跳过。")

    previous_collection_id = post.collection_id
    collection_id = snapshot.get("collection_id")
    collection = db.session.get(Collection, collection_id) if collection_id else None
    if collection_id and (collection is None or not is_collection_member(actor.id, collection)):
        warnings.append("原 Collection 已不可访问，恢复后内容保持独立且仅自己可见。")
        collection = None
    post.collection = collection
    if previous_collection_id != (collection.id if collection is not None else None):
        post.collection_sort_order = None
        post.collection_highlight_order = None
    if collection is not None:
        post.visibility = PostVisibility.PRIVATE.value
    else:
        visibility = snapshot.get("visibility")
        post.visibility = (
            visibility if visibility in {PostVisibility.LOGIN_ONLY.value, PostVisibility.PRIVATE.value}
            else PostVisibility.PRIVATE.value
        )

    cover_media_id = snapshot.get("cover_media_id")
    cover = db.session.get(Media, cover_media_id) if cover_media_id else None
    if cover_media_id and (
        cover is None or cover.owner_id != actor.id or cover.kind != "image"
        or cover.status != "active" or cover.deleted_at is not None
        or cover.bound_type != "post" or cover.bound_id != post.id
    ):
        warnings.append("原封面已不可用，恢复时已清除。")
        cover = None
    post.cover_media = cover

    if post.post_type == "article" and snapshot.get("slug"):
        update_article_slug(post, actor.id, snapshot["slug"])
    return warnings
