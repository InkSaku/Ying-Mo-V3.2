"""Add private post reading statistics.

Revision ID: 20260817_0005
Revises: 20260815_0004
Create Date: 2026-08-17
"""
from alembic import op
import sqlalchemy as sa


revision = "20260817_0005"
down_revision = "20260815_0004"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "post_read_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "post_id",
            sa.Integer(),
            sa.ForeignKey("posts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "reader_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("bucket_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "post_id",
            "reader_id",
            "bucket_start",
            name="uq_post_read_events_post_reader_bucket",
        ),
    )
    op.create_index(
        "ix_post_read_events_post_created",
        "post_read_events",
        ["post_id", "created_at"],
    )
    op.create_index(
        "ix_post_read_events_reader_post_created",
        "post_read_events",
        ["reader_id", "post_id", "created_at"],
    )


def downgrade():
    op.drop_index(
        "ix_post_read_events_reader_post_created",
        table_name="post_read_events",
    )
    op.drop_index(
        "ix_post_read_events_post_created",
        table_name="post_read_events",
    )
    op.drop_table("post_read_events")
