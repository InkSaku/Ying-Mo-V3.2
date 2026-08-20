from datetime import datetime, timezone
import hashlib

from sqlalchemy.exc import IntegrityError

from app.access import is_collection_member
from app.common.validation import SLUG_RE, normalize_name, slugify
from app.extensions import db
from app.models import (
    ArticleSlug, Category, Collection, Media, Notification, Post, PostStatus, PostType,
    PostVisibility, Tag,
)


class DomainError(Exception):
    def __init__(self, code, message, status=400, details=None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.details = details


def utcnow():
    return datetime.now(timezone.utc)


def current_article_slug(post_id):
    row = db.session.scalar(
        db.select(ArticleSlug).where(
            ArticleSlug.current_post_id == post_id,
        )
    )
    return row.slug if row else None


def apply_tags(post, tag_names):
    if tag_names is None:
        return
    if not isinstance(tag_names, list) or len(tag_names) > 20:
        raise DomainError("VALIDATION_ERROR", "tag_names 必须是最多 20 项的数组。", 422)
    tags = []
    seen = set()
    for raw in tag_names:
        if not isinstance(raw, str) or not raw.strip():
            raise DomainError("VALIDATION_ERROR", "Tag 名称不能为空。", 422)
        name = " ".join(raw.strip().split())
        normalized = normalize_name(name)
        if normalized in seen:
            continue
        seen.add(normalized)
        tag = db.session.scalar(db.select(Tag).where(Tag.name_normalized == normalized))
        if tag is None:
            base_slug = slugify(name) or f"tag-{hashlib.sha256(normalized.encode('utf-8')).hexdigest()[:10]}"
            counter = 1
            while tag is None:
                candidate = base_slug if counter == 1 else f"{base_slug}-{counter}"
                if db.session.scalar(db.select(Tag.id).where(Tag.slug == candidate)):
                    counter += 1
                    continue
                try:
                    with db.session.begin_nested():
                        candidate_tag = Tag(name=name, name_normalized=normalized, slug=candidate)
                        db.session.add(candidate_tag)
                        db.session.flush()
                    tag = candidate_tag
                except IntegrityError:
                    tag = db.session.scalar(db.select(Tag).where(Tag.name_normalized == normalized))
                    counter += 1
        if not tag.is_active:
            raise DomainError("VALIDATION_ERROR", f"Tag “{name}” 已停用。", 422)
        tags.append(tag)
    post.tags = tags


def apply_category(post, category_id):
    if category_id is None:
        post.category = None
        return
    if post.post_type != PostType.ARTICLE.value:
        raise DomainError("VALIDATION_ERROR", "Note 不支持 Category。", 422)
    category = db.session.get(Category, category_id)
    if category is None or not category.is_active:
        raise DomainError("VALIDATION_ERROR", "Category 不存在或已停用。", 422)
    post.category = category


def apply_collection(post, actor_id, collection_id):
    if collection_id is None:
        was_in_collection = post.collection_id is not None
        post.collection = None
        post.collection_sort_order = None
        # 只有真正从 Collection 脱离时才安全回退为 private。
        # 原本就是独立 Post 时，保留作者明确选择的 visibility。
        if was_in_collection:
            post.visibility = PostVisibility.PRIVATE.value
        return
    collection = db.session.get(Collection, collection_id)
    if collection is None or not is_collection_member(actor_id, collection):
        raise DomainError("RESOURCE_NOT_FOUND", "目标 Collection 不存在或不可访问。", 404)
    post.collection = collection
    post.visibility = PostVisibility.PRIVATE.value


def validate_publish(post, requested_slug=None):
    if post.post_type == PostType.ARTICLE.value:
        if not isinstance(post.title, str) or not post.title.strip():
            raise DomainError("VALIDATION_ERROR", "Article 发布时标题必填。", 422)
        if not isinstance(post.body, str) or not post.body.strip():
            raise DomainError("VALIDATION_ERROR", "Article 发布时正文不能为空。", 422)
        slug = (requested_slug or post.slug_candidate or current_article_slug(post.id) or "").strip().lower()
        if not SLUG_RE.fullmatch(slug):
            raise DomainError("VALIDATION_ERROR", "Article Slug 格式不合法。", 422)
        return slug
    if post.post_type == PostType.NOTE.value:
        has_body = bool(isinstance(post.body, str) and post.body.strip())
        has_cover = post.cover_media_id is not None
        has_bound_media = db.session.scalar(db.select(Media.id).where(
            Media.bound_type == "post", Media.bound_id == post.id,
            Media.status == "active", Media.deleted_at.is_(None),
        ).limit(1)) is not None
        has_external = bool(post.external_video_url)
        if not (has_body or has_cover or has_bound_media or has_external):
            raise DomainError("VALIDATION_ERROR", "Note 至少需要文字、图片/Live Photo 或外部视频之一。", 422)
        return None
    raise DomainError("VALIDATION_ERROR", "post_type 不合法。", 422)


def reserve_article_slug(post, slug):
    current = db.session.scalar(
        db.select(ArticleSlug).where(
            ArticleSlug.current_post_id == post.id,
        )
    )
    if current and current.slug == slug:
        return
    occupied = db.session.scalar(db.select(ArticleSlug).where(ArticleSlug.slug == slug))
    if occupied and occupied.post_id != post.id:
        raise DomainError("DUPLICATE_RESOURCE", "该 Article Slug 已被占用。", 409)
    now = utcnow()
    if current:
        current.is_current = False
        current.current_post_id = None
        current.retired_at = now
        # Free the database-enforced one-current-slug slot before reactivating
        # an older row for the same Article.
        db.session.flush()
    if occupied and occupied.post_id == post.id:
        occupied.is_current = True
        occupied.current_post_id = post.id
        occupied.retired_at = None
    else:
        db.session.add(ArticleSlug(post_id=post.id, current_post_id=post.id, slug=slug, is_current=True))


def publish_post(post, actor_id, slug=None):
    if post.author_id != actor_id:
        raise DomainError("RESOURCE_NOT_FOUND", "Post 不存在。", 404)
    if post.collection_id is not None and not is_collection_member(actor_id, post.collection):
        raise DomainError("PERMISSION_DENIED", "你已不再属于目标 Collection，不能发布到该 Collection。", 403)
    actual_slug = validate_publish(post, slug)
    if post.post_type == PostType.ARTICLE.value:
        reserve_article_slug(post, actual_slug)
        post.slug_candidate = actual_slug

    first_publish = post.published_at is None
    if first_publish:
        post.published_at = utcnow()
    post.status = PostStatus.PUBLISHED.value

    if post.collection_id is not None:
        post.visibility = PostVisibility.PRIVATE.value
        if post.collection.first_shared_at is None:
            post.collection.first_shared_at = utcnow()
        if first_publish and post.collection.creator_id != actor_id:
            db.session.add(Notification(
                user_id=post.collection.creator_id,
                actor_id=actor_id,
                kind="collection_new_post",
                target_type="post",
                post_id=post.id,
                collection_id=post.collection_id,
                message="你的 Collection 收到了一篇新的成员投稿。",
            ))
    if post.category and post.category.first_used_at is None:
        post.category.first_used_at = utcnow()
    for tag in post.tags:
        if tag.first_used_at is None:
            tag.first_used_at = utcnow()
    return actual_slug


def update_article_slug(post, actor_id, slug):
    if post.author_id != actor_id or post.post_type != PostType.ARTICLE.value:
        raise DomainError("RESOURCE_NOT_FOUND", "Article 不存在。", 404)
    if not post.was_published:
        return
    normalized = slug.strip().lower() if isinstance(slug, str) else ""
    if not SLUG_RE.fullmatch(normalized):
        raise DomainError("VALIDATION_ERROR", "Article Slug 格式不合法。", 422)
    reserve_article_slug(post, normalized)
