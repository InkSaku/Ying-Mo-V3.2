"""add future member enrollment to Collections

Revision ID: 20260822_0008
Revises: 20260822_0007
"""

from alembic import op
import sqlalchemy as sa


revision = "20260822_0008"
down_revision = "20260822_0007"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("collections") as batch:
        batch.add_column(sa.Column(
            "auto_add_future_members",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ))
    with op.batch_alter_table("collection_members") as batch:
        batch.add_column(sa.Column(
            "join_source",
            sa.String(length=30),
            nullable=False,
            server_default="manual",
        ))
        batch.create_check_constraint(
            "ck_collection_members_join_source",
            "join_source IN ('manual', 'future_member_auto')",
        )


def downgrade():
    with op.batch_alter_table("collection_members") as batch:
        batch.drop_constraint("ck_collection_members_join_source", type_="check")
        batch.drop_column("join_source")
    with op.batch_alter_table("collections") as batch:
        batch.drop_column("auto_add_future_members")
