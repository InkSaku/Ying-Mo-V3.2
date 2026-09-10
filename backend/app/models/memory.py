from datetime import datetime, timezone

from app.extensions import db


def utcnow():
    return datetime.now(timezone.utc)


class PostMemoryLink(db.Model):
    __tablename__ = "post_memory_links"
    __table_args__ = (
        db.UniqueConstraint(
            "contribution_post_id",
            name="uq_post_memory_links_contribution",
        ),
        db.UniqueConstraint(
            "author_id", "client_request_id",
            name="uq_post_memory_links_author_request",
        ),
        db.CheckConstraint(
            "root_post_id <> contribution_post_id",
            name="ck_post_memory_links_distinct_posts",
        ),
        db.Index(
            "ix_post_memory_links_root_scope",
            "root_post_id", "collection_id", "invalidated_at", "detached_at",
        ),
        db.Index("ix_post_memory_links_collection", "collection_id"),
    )

    id = db.Column(db.Integer, primary_key=True)
    contribution_post_id = db.Column(
        db.Integer,
        db.ForeignKey("posts.id", ondelete="CASCADE"),
        nullable=False,
    )
    root_post_id = db.Column(
        db.Integer,
        db.ForeignKey("posts.id", ondelete="CASCADE"),
        nullable=False,
    )
    collection_id = db.Column(
        db.Integer,
        db.ForeignKey("collections.id", ondelete="CASCADE"),
        nullable=False,
    )
    author_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    client_request_id = db.Column(db.String(36), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    invalidated_at = db.Column(db.DateTime(timezone=True), nullable=True)
    invalidation_reason = db.Column(db.String(40), nullable=True)
    detached_at = db.Column(db.DateTime(timezone=True), nullable=True)

    contribution_post = db.relationship("Post", foreign_keys=[contribution_post_id])
    root_post = db.relationship("Post", foreign_keys=[root_post_id])
    collection = db.relationship("Collection")
    author = db.relationship("User")

    @property
    def active(self):
        return self.invalidated_at is None and self.detached_at is None
