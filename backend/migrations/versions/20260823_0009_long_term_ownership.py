"""add long-term notification and media ownership fields

Revision ID: 20260823_0009
Revises: 20260822_0008
"""

from alembic import op
import sqlalchemy as sa


revision = "20260823_0009"
down_revision = "20260822_0008"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "collection_notification_preferences",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("collection_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("level", sa.String(length=20), server_default="all", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "level IN ('all', 'important', 'muted')",
            name="ck_collection_notification_preferences_level",
        ),
        sa.ForeignKeyConstraint(["collection_id"], ["collections.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "collection_id", "user_id",
            name="uq_collection_notification_preferences_collection_user",
        ),
    )
    op.create_index(
        "ix_collection_notification_preferences_user_collection",
        "collection_notification_preferences",
        ["user_id", "collection_id"],
        unique=False,
    )
    with op.batch_alter_table("media") as batch:
        batch.add_column(sa.Column("content_sha256", sa.String(length=64), nullable=True))
        batch.add_column(sa.Column("original_filename", sa.String(length=255), nullable=True))
        batch.add_column(sa.Column("alt_text", sa.String(length=300), nullable=True))
        batch.create_index("ix_media_content_sha256", ["content_sha256"], unique=False)


def downgrade():
    with op.batch_alter_table("media") as batch:
        batch.drop_index("ix_media_content_sha256")
        batch.drop_column("alt_text")
        batch.drop_column("original_filename")
        batch.drop_column("content_sha256")
    op.drop_index(
        "ix_collection_notification_preferences_user_collection",
        table_name="collection_notification_preferences",
    )
    op.drop_table("collection_notification_preferences")
