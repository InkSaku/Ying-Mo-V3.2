"""Add optimistic edit version to posts.

Revision ID: 20260815_0003
Revises: 20260814_0002
Create Date: 2026-08-15
"""
from alembic import op
import sqlalchemy as sa


revision = "20260815_0003"
down_revision = "20260814_0002"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("posts") as batch:
        batch.add_column(sa.Column("edit_version", sa.Integer(), nullable=False, server_default="1"))
        batch.create_check_constraint("ck_posts_edit_version", "edit_version >= 1")


def downgrade():
    with op.batch_alter_table("posts") as batch:
        batch.drop_constraint("ck_posts_edit_version", type_="check")
        batch.drop_column("edit_version")
