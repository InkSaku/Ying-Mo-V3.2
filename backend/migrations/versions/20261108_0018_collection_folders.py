"""Add a folder tree inside collections.

Revision ID: 20261108_0018
Revises: 20261107_0017
"""
from alembic import op
import sqlalchemy as sa

revision = "20261108_0018"
down_revision = "20261107_0017"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "collection_folders",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("collection_id", sa.Integer(), nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["collection_id"], ["collections.id"],
            name="fk_collection_folders_collection", ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["parent_id"], ["collection_folders.id"],
            name="fk_collection_folders_parent", ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"], ["users.id"],
            name="fk_collection_folders_created_by", ondelete="SET NULL",
        ),
    )
    op.create_index(
        "ix_collection_folders_tree",
        "collection_folders",
        ["collection_id", "parent_id", "sort_order"],
    )
    with op.batch_alter_table("posts") as batch:
        batch.add_column(sa.Column("collection_folder_id", sa.Integer(), nullable=True))
        batch.create_index("ix_posts_collection_folder", ["collection_folder_id"])
        batch.create_foreign_key(
            "fk_posts_collection_folder", "collection_folders",
            ["collection_folder_id"], ["id"], ondelete="SET NULL",
        )


def downgrade():
    with op.batch_alter_table("posts") as batch:
        batch.drop_constraint("fk_posts_collection_folder", type_="foreignkey")
        batch.drop_index("ix_posts_collection_folder")
        batch.drop_column("collection_folder_id")
    op.drop_index("ix_collection_folders_tree", table_name="collection_folders")
    op.drop_table("collection_folders")
