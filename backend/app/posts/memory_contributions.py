from datetime import datetime, timezone
from uuid import UUID

from flask import current_app
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import aliased

from app.access import can_read_post, is_collection_member
from app.common.pagination import pagination_meta
from app.common.time import isoformat_utc
from app.extensions import db
from app.models import (
    Collection, CollectionStatus, Post, PostMemoryLink, PostModerationStatus,
    PostStatus, PostType, PostVisibility,
)
from app.posts.browsing import serialize_browse_post, serialize_browse_posts
from app.posts.service import DomainError, current_article_slug


def utcnow():
    return datetime.now(timezone.utc)


def _canonical(post):
    if post.post_type == PostType.ARTICLE.value:
        slug = current_article_slug(post.id) or post.slug_candidate
        return f"/articles/{slug}" if slug else None
    return f"/notes/{post.id}"


def _active_link_for_contribution(post_id):
    return db.session.scalar(db.select(PostMemoryLink).where(
        PostMemoryLink.contribution_post_id == post_id,
        PostMemoryLink.invalidated_at.is_(None),
        PostMemoryLink.detached_at.is_(None),
    ))


def _attached_link_for_contribution(post_id):
    """Return the relationship until the author explicitly detaches it."""
    return db.session.scalar(db.select(PostMemoryLink).where(
        PostMemoryLink.contribution_post_id == post_id,
        PostMemoryLink.detached_at.is_(None),
    ))


def memory_management(post):
    link = _attached_link_for_contribution(post.id)
    if link is None:
        return None
    return {
        "root_post_id": link.root_post_id,
        "collection_id": link.collection_id,
        "state": "invalidated" if link.invalidated_at is not None else "active",
        "invalidation_reason": link.invalidation_reason,
    }


def _valid_root(post, actor_id):
    return bool(
        post
        and post.collection_id is not None
        and post.collection is not None
        and post.collection.status == CollectionStatus.ACTIVE.value
        and can_read_post(actor_id, post, include_archived=True)
    )


def resolve_memory_root(post, actor_id):
    """Resolve a readable Post or contribution to its single, stable root."""
    if not can_read_post(actor_id, post, include_archived=True):
        return None, None
    link = _active_link_for_contribution(post.id)
    if link is None:
        return (post, None) if _valid_root(post, actor_id) else (None, None)
    root = link.root_post
    if (
        root is None
        or root.collection_id != link.collection_id
        or post.collection_id != link.collection_id
        or not _valid_root(root, actor_id)
    ):
        return None, None
    return root, link


def _base_links(root):
    contribution = aliased(Post)
    return (
        db.select(PostMemoryLink)
        .join(contribution, contribution.id == PostMemoryLink.contribution_post_id)
        .where(
            PostMemoryLink.root_post_id == root.id,
            PostMemoryLink.collection_id == root.collection_id,
            PostMemoryLink.invalidated_at.is_(None),
            PostMemoryLink.detached_at.is_(None),
            contribution.collection_id == root.collection_id,
            contribution.deleted_at.is_(None),
            contribution.moderation_status == PostModerationStatus.ACTIVE.value,
            contribution.status.in_((PostStatus.PUBLISHED.value, PostStatus.ARCHIVED.value)),
        )
    )


def memory_summary(post, actor_id):
    root, current_link = resolve_memory_root(post, actor_id)
    if root is None:
        return None
    count = db.session.scalar(
        db.select(func.count()).select_from(_base_links(root).subquery())
    ) or 0
    author_ids = set(db.session.scalars(
        _base_links(root).with_only_columns(PostMemoryLink.author_id).distinct()
    ).all())
    author_ids.add(root.author_id)
    root_data = serialize_browse_post(root, actor_id=actor_id)
    root_data["canonical"] = _canonical(root)
    return {
        "root_post": root_data,
        "role": "contribution" if current_link else "root",
        "contribution_count": count,
        "participant_count": len(author_ids),
        "can_contribute": bool(
            current_app.config.get("MEMORY_CONTRIBUTIONS_ENABLED")
            and is_collection_member(actor_id, root.collection)
        ),
    }


def memory_thread(post, actor_id, *, page, size):
    root, current_link = resolve_memory_root(post, actor_id)
    if root is None:
        if can_read_post(actor_id, post, include_archived=True):
            raise DomainError("MEMORY_NOT_ELIGIBLE", "这条记录当前不能建立共同回忆。", 422)
        raise DomainError("RESOURCE_NOT_FOUND", "Post 不存在。", 404)
    statement = _base_links(root)
    total = db.session.scalar(db.select(func.count()).select_from(statement.subquery())) or 0
    links = db.session.scalars(
        statement.order_by(PostMemoryLink.created_at.asc(), PostMemoryLink.id.asc())
        .offset((page - 1) * size).limit(size)
    ).all()
    contributions = [link.contribution_post for link in links]
    items = serialize_browse_posts(contributions, actor_id=actor_id)
    for item, link in zip(items, links):
        item["memory_linked_at"] = isoformat_utc(link.created_at)
        item["canonical"] = _canonical(link.contribution_post)
    root_data = serialize_browse_post(root, actor_id=actor_id)
    root_data["canonical"] = _canonical(root)
    summary = memory_summary(post, actor_id)
    return {
        **summary,
        "collection": {
            "id": root.collection.id,
            "name": root.collection.name,
            "slug": root.collection.slug,
        },
        "current_post_id": post.id,
        "composer_defaults": {
            "occurred_at": isoformat_utc(root.occurred_at) if root.post_type == PostType.NOTE.value else None,
            "location": root.location if root.post_type == PostType.NOTE.value else None,
        },
        "items": items,
    }, pagination_meta(page, size, total)


def _request_uuid(value):
    try:
        parsed = UUID(value) if isinstance(value, str) else None
    except ValueError:
        parsed = None
    if parsed is None or str(parsed) != value.lower():
        raise DomainError("VALIDATION_ERROR", "client_request_id 必须是标准 UUID。", 422)
    return str(parsed)


def create_contribution_draft(source, actor, client_request_id):
    if not current_app.config.get("MEMORY_CONTRIBUTIONS_ENABLED"):
        raise DomainError("FEATURE_DISABLED", "共同回忆补充暂未开放。", 503)
    request_id = _request_uuid(client_request_id)
    existing = db.session.scalar(db.select(PostMemoryLink).where(
        PostMemoryLink.author_id == actor.id,
        PostMemoryLink.client_request_id == request_id,
    ))
    root, _ = resolve_memory_root(source, actor.id)
    if existing is not None:
        if root is None or existing.root_post_id != root.id:
            raise DomainError("IDEMPOTENCY_CONFLICT", "这次创建请求已被使用。", 409)
        return existing.contribution_post, False
    if root is None or not is_collection_member(actor.id, root.collection):
        raise DomainError("RESOURCE_NOT_FOUND", "Post 不存在。", 404)

    root_id = root.id
    contribution = Post(
        author_id=actor.id,
        post_type=PostType.NOTE.value,
        status=PostStatus.DRAFT.value,
        visibility=PostVisibility.PRIVATE.value,
        collection_id=root.collection_id,
        occurred_at=root.occurred_at if root.post_type == PostType.NOTE.value else None,
        location=root.location if root.post_type == PostType.NOTE.value else None,
    )
    db.session.add(contribution)
    db.session.flush()
    db.session.add(PostMemoryLink(
        contribution_post_id=contribution.id,
        root_post_id=root_id,
        collection_id=root.collection_id,
        author_id=actor.id,
        client_request_id=request_id,
    ))
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        existing = db.session.scalar(db.select(PostMemoryLink).where(
            PostMemoryLink.author_id == actor.id,
            PostMemoryLink.client_request_id == request_id,
        ))
        if existing is None or existing.root_post_id != root_id:
            raise
        return existing.contribution_post, False
    return contribution, True


def validate_memory_contribution_publish(post, actor_id, expected_version):
    link = db.session.scalar(
        db.select(PostMemoryLink).where(
            PostMemoryLink.contribution_post_id == post.id,
            PostMemoryLink.detached_at.is_(None),
        ).with_for_update()
    )
    if link is None:
        return None
    if post.status in (PostStatus.PUBLISHED.value, PostStatus.ARCHIVED.value):
        return link.root_post
    if isinstance(expected_version, bool) or not isinstance(expected_version, int):
        raise DomainError("VALIDATION_ERROR", "共同回忆发布必须提供 expected_version。", 422)
    root = db.session.scalar(
        db.select(Post).where(Post.id == link.root_post_id).with_for_update()
    )
    if root is not None and root.collection_id is not None:
        db.session.scalar(
            db.select(Collection).where(Collection.id == root.collection_id).with_for_update()
        )
    if (
        link.invalidated_at is not None
        or
        post.author_id != actor_id
        or post.post_type != PostType.NOTE.value
        or root is None
        or root.collection_id != link.collection_id
        or post.collection_id != link.collection_id
        or not _valid_root(root, actor_id)
        or not is_collection_member(actor_id, root.collection)
    ):
        raise DomainError("MEMORY_CONTEXT_UNAVAILABLE", "原记录或参与范围已不可用，补充草稿仍已保留。", 409)
    if expected_version != post.edit_version:
        raise DomainError("EDIT_CONFLICT", "内容已在其他窗口更新，请重新载入后再发布。", 409, {
            "expected_version": expected_version,
            "current_version": post.edit_version,
        })
    return root


def ensure_memory_scope_update(post, data):
    link = _attached_link_for_contribution(post.id)
    if link is None:
        return
    if "post_type" in data and data["post_type"] != PostType.NOTE.value:
        raise DomainError("MEMORY_SCOPE_LOCKED", "共同回忆补充固定为随记。", 409)
    if "collection_id" in data and data["collection_id"] != link.collection_id:
        raise DomainError("MEMORY_SCOPE_LOCKED", "请先解除共同回忆关联，再修改合集。", 409)
    if "visibility" in data and data["visibility"] != PostVisibility.PRIVATE.value:
        raise DomainError("MEMORY_SCOPE_LOCKED", "共同回忆补充的范围由合集成员决定。", 409)


def detach_memory_link(post, actor_id, *, expected_version, destination):
    link = _attached_link_for_contribution(post.id)
    if post.author_id != actor_id or link is None:
        raise DomainError("RESOURCE_NOT_FOUND", "共同回忆补充不存在。", 404)
    if expected_version != post.edit_version:
        raise DomainError("EDIT_CONFLICT", "内容已在其他窗口更新，请重新载入后再继续。", 409)
    if destination not in {"private", "keep_collection"}:
        raise DomainError("VALIDATION_ERROR", "destination 不合法。", 422)
    if destination == "keep_collection" and not is_collection_member(actor_id, post.collection):
        raise DomainError("MEMORY_CONTEXT_UNAVAILABLE", "原记录或参与范围已不可用。", 409)
    link.detached_at = utcnow()
    if destination == "private":
        post.collection_id = None
        post.collection_sort_order = None
        post.collection_highlight_order = None
        post.visibility = PostVisibility.PRIVATE.value
    post.updated_at = utcnow()
    db.session.commit()
    return post


def invalidate_links_for_post(post_id, reason):
    now = utcnow()
    db.session.execute(
        db.update(PostMemoryLink).where(
            PostMemoryLink.invalidated_at.is_(None),
            PostMemoryLink.detached_at.is_(None),
            db.or_(
                PostMemoryLink.root_post_id == post_id,
                PostMemoryLink.contribution_post_id == post_id,
            ),
        ).values(invalidated_at=now, invalidation_reason=reason)
    )
