from datetime import datetime, timezone

from app.extensions import db


def utcnow():
    return datetime.now(timezone.utc)


class PostReadEvent(db.Model):
    __tablename__ = "post_read_events"
    __table_args__ = (
        db.UniqueConstraint(
            "post_id",
            "reader_id",
            "bucket_start",
            name="uq_post_read_events_post_reader_bucket",
        ),
        db.Index("ix_post_read_events_post_created", "post_id", "created_at"),
        db.Index(
            "ix_post_read_events_reader_post_created",
            "reader_id",
            "post_id",
            "created_at",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(
        db.Integer,
        db.ForeignKey("posts.id", ondelete="CASCADE"),
        nullable=False,
    )
    reader_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    bucket_start = db.Column(db.DateTime(timezone=True), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
