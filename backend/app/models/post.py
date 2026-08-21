from datetime import datetime, timezone
from enum import StrEnum

from app.extensions import db
from app.common.time import isoformat_utc


def utcnow():
    return datetime.now(timezone.utc)


class PostType(StrEnum):
    ARTICLE = "article"
    NOTE = "note"


class PostStatus(StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class PostVisibility(StrEnum):
    LOGIN_ONLY = "login_only"
    PRIVATE = "private"


class PostModerationStatus(StrEnum):
    ACTIVE = "active"
    HIDDEN = "hidden"


post_tags = db.Table(
    "post_tags",
    db.Column("post_id", db.Integer, db.ForeignKey("posts.id", ondelete="CASCADE"), primary_key=True),
    db.Column("tag_id", db.Integer, db.ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Post(db.Model):
    __tablename__ = "posts"
    __table_args__ = (
        db.CheckConstraint("post_type IN ('article', 'note')", name="ck_posts_type"),
        db.CheckConstraint("status IN ('draft', 'published', 'archived')", name="ck_posts_status"),
        db.CheckConstraint("visibility IN ('login_only', 'private')", name="ck_posts_visibility"),
        db.CheckConstraint("moderation_status IN ('active', 'hidden')", name="ck_posts_moderation"),
        db.CheckConstraint("edit_version >= 1", name="ck_posts_edit_version"),
        db.Index("ix_posts_author_published", "author_id", "published_at"),
        db.Index("ix_posts_type_status_visibility_published", "post_type", "status", "visibility", "published_at"),
        db.Index("ix_posts_collection_published", "collection_id", "published_at"),
        db.Index("ix_posts_category_published", "category_id", "published_at"),
    )

    id = db.Column(db.Integer, primary_key=True)
    author_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    collection_id = db.Column(db.Integer, db.ForeignKey("collections.id", ondelete="SET NULL"), nullable=True)
    post_type = db.Column(db.String(20), nullable=False)
    title = db.Column(db.String(240), nullable=True)
    summary = db.Column(db.String(500), nullable=True)
    body = db.Column(db.Text, nullable=True)
    content_format = db.Column(db.String(20), nullable=False, default="markdown", server_default="markdown")
    cover_media_id = db.Column(db.Integer, db.ForeignKey("media.id", ondelete="SET NULL"), nullable=True)
    category_id = db.Column(db.Integer, db.ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    status = db.Column(db.String(20), nullable=False, default=PostStatus.DRAFT.value, server_default=PostStatus.DRAFT.value)
    visibility = db.Column(db.String(20), nullable=False, default=PostVisibility.PRIVATE.value, server_default=PostVisibility.PRIVATE.value)
    moderation_status = db.Column(db.String(20), nullable=False, default=PostModerationStatus.ACTIVE.value, server_default=PostModerationStatus.ACTIVE.value)
    published_at = db.Column(db.DateTime(timezone=True), nullable=True)
    occurred_at = db.Column(db.DateTime(timezone=True), nullable=True)
    location = db.Column(db.String(255), nullable=True)
    mood = db.Column(db.String(100), nullable=True)
    external_video_url = db.Column(db.String(1000), nullable=True)
    slug_candidate = db.Column(db.String(180), nullable=True)
    collection_sort_order = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)
    edit_version = db.Column(db.Integer, nullable=False, default=1, server_default="1")
    deleted_at = db.Column(db.DateTime(timezone=True), nullable=True)

    __mapper_args__ = {"version_id_col": edit_version}

    author = db.relationship("User")
    collection = db.relationship("Collection", back_populates="posts")
    cover_media = db.relationship("Media", foreign_keys=[cover_media_id])
    category = db.relationship("Category")
    tags = db.relationship("Tag", secondary=post_tags)
    revisions = db.relationship("PostRevision", back_populates="post", cascade="all, delete-orphan")

    @property
    def was_published(self):
        return self.published_at is not None

    @property
    def semantic_time(self):
        if self.post_type == PostType.NOTE.value:
            return self.occurred_at or self.published_at
        return self.published_at

    def to_dict(self, *, include_body=True, include_inactive_taxonomy=False):
        data = {
            "id": self.id,
            "author": self.author.public_dict() if self.author else None,
            "collection_id": self.collection_id,
            "post_type": self.post_type,
            "title": self.title,
            "summary": self.summary,
            "content_format": self.content_format,
            "cover_media_id": self.cover_media_id,
            "cover_media": (
                self.cover_media.to_dict()
                if self.cover_media
                and self.cover_media.status == "active"
                and self.cover_media.deleted_at is None
                else None
            ),
            "category": (
                self.category.to_dict()
                if self.category and (include_inactive_taxonomy or self.category.is_active)
                else None
            ),
            "tags": [
                tag.to_dict() for tag in self.tags
                if include_inactive_taxonomy or tag.is_active
            ],
            "status": self.status,
            "visibility": self.visibility,
            "moderation_status": self.moderation_status,
            "published_at": isoformat_utc(self.published_at),
            "occurred_at": isoformat_utc(self.occurred_at),
            "semantic_time": isoformat_utc(self.semantic_time),
            "location": self.location,
            "mood": self.mood,
            "external_video_url": self.external_video_url,
            "slug_candidate": self.slug_candidate if not self.was_published else None,
            "collection_sort_order": self.collection_sort_order,
            "created_at": isoformat_utc(self.created_at),
            "updated_at": isoformat_utc(self.updated_at),
            "edit_version": self.edit_version,
        }
        if include_body:
            data["body"] = self.body
            if self.content_format == "markdown":
                from app.common.markdown import render_safe_markdown_document
                markdown_document = render_safe_markdown_document(self.body)
                data["rendered_html"] = markdown_document["html"]
                data["outline"] = markdown_document["outline"] if self.post_type == PostType.ARTICLE.value else []
        return data


class ArticleSlug(db.Model):
    __tablename__ = "article_slugs"
    __table_args__ = (
        db.UniqueConstraint("slug", name="uq_article_slugs_slug"),
        db.UniqueConstraint("current_post_id", name="uq_article_slugs_current_post"),
        db.Index("ix_article_slugs_post_current", "post_id", "is_current"),
    )

    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(db.Integer, db.ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)
    current_post_id = db.Column(db.Integer, db.ForeignKey("posts.id", ondelete="CASCADE"), nullable=True)
    slug = db.Column(db.String(180), nullable=False, index=True)
    is_current = db.Column(db.Boolean, nullable=False, default=True, server_default=db.true())
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    retired_at = db.Column(db.DateTime(timezone=True), nullable=True)

    post = db.relationship("Post", foreign_keys=[post_id])
