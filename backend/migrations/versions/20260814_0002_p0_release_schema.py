"""Add P0 release support tables and media/session metadata.

Revision ID: 20260814_0002
Revises: 20260814_0001
Create Date: 2026-08-14
"""
from alembic import op
from alembic import context
import sqlalchemy as sa


revision = "20260814_0002"
down_revision = "20260814_0001"
branch_labels = None
depends_on = None


def upgrade():
    connection = op.get_bind()
    public_count = connection.scalar(sa.text("SELECT COUNT(*) FROM posts WHERE visibility = 'public'")) or 0
    context.get_context().config.print_stdout(
        f"V3.2 visibility migration: converting {public_count} public post(s) to login_only"
    )
    op.execute(sa.text("UPDATE posts SET visibility = 'login_only' WHERE visibility = 'public'"))
    with op.batch_alter_table("posts") as batch:
        batch.drop_constraint("ck_posts_visibility", type_="check")
        batch.create_check_constraint("ck_posts_visibility", "visibility IN ('login_only', 'private')")

    op.execute(sa.text("UPDATE collections SET status = 'hidden' WHERE status = 'archived'"))
    with op.batch_alter_table("collections") as batch:
        batch.drop_constraint("ck_collections_status", type_="check")
        batch.create_check_constraint("ck_collections_status", "status IN ('active', 'hidden')")

    with op.batch_alter_table("posts") as batch:
        batch.add_column(sa.Column("slug_candidate", sa.String(length=180), nullable=True))

    with op.batch_alter_table("article_slugs") as batch:
        batch.add_column(sa.Column("current_post_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            "fk_article_slugs_current_post_id_posts", "posts", ["current_post_id"], ["id"], ondelete="CASCADE"
        )
    op.execute(sa.text("UPDATE article_slugs SET current_post_id = post_id WHERE is_current = 1"))
    with op.batch_alter_table("article_slugs") as batch:
        batch.create_unique_constraint("uq_article_slugs_current_post", ["current_post_id"])

    with op.batch_alter_table("refresh_sessions") as batch:
        batch.add_column(sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("user_agent", sa.String(length=255), nullable=True))
        batch.add_column(sa.Column("ip_hash", sa.String(length=64), nullable=True))
    op.execute(sa.text("UPDATE refresh_sessions SET last_used_at = created_at WHERE last_used_at IS NULL"))
    with op.batch_alter_table("refresh_sessions") as batch:
        batch.alter_column(
            "last_used_at",
            existing_type=sa.DateTime(timezone=True),
            existing_nullable=True,
            nullable=False,
        )

    with op.batch_alter_table("media") as batch:
        batch.add_column(sa.Column("live_photo_pair_id", sa.String(length=36), nullable=True))
        batch.add_column(sa.Column("status", sa.String(length=20), nullable=False, server_default="active"))
        batch.add_column(sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
        batch.create_index("ix_media_live_photo_pair_id", ["live_photo_pair_id"])
        batch.create_check_constraint(
            "ck_media_kind",
            "kind IN ('image', 'live_photo_image', 'live_photo_video')",
        )
        batch.create_check_constraint(
            "ck_media_bound_type",
            "bound_type IS NULL OR bound_type IN ('post', 'collection', 'avatar')",
        )
        batch.create_check_constraint("ck_media_status", "status IN ('active', 'hidden')")

    with op.batch_alter_table("users") as batch:
        batch.create_foreign_key(
            "fk_users_avatar_media_id_media", "media", ["avatar_media_id"], ["id"], ondelete="SET NULL"
        )

    with op.batch_alter_table("comments") as batch:
        batch.create_check_constraint(
            "ck_comments_status",
            "status IN ('active', 'deleted', 'hidden')",
        )

    with op.batch_alter_table("notifications") as batch:
        batch.add_column(
            sa.Column("target_type", sa.String(length=30), nullable=False, server_default="system")
        )

    op.create_table(
        "featured_content",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("content_type", sa.String(length=20), nullable=False),
        sa.Column("post_id", sa.Integer(), sa.ForeignKey("posts.id", ondelete="CASCADE"), nullable=True),
        sa.Column(
            "collection_id", sa.Integer(), sa.ForeignKey("collections.id", ondelete="CASCADE"), nullable=True
        ),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("content_type IN ('article', 'collection')", name="ck_featured_content_type"),
        sa.CheckConstraint(
            "(content_type = 'article' AND post_id IS NOT NULL AND collection_id IS NULL) OR "
            "(content_type = 'collection' AND collection_id IS NOT NULL AND post_id IS NULL)",
            name="ck_featured_content_target",
        ),
        sa.UniqueConstraint("post_id", name="uq_featured_content_post"),
        sa.UniqueConstraint("collection_id", name="uq_featured_content_collection"),
    )

    op.create_table(
        "site_settings",
        sa.Column("key", sa.String(length=100), primary_key=True),
        sa.Column("value", sa.JSON(), nullable=False),
        sa.Column("updated_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "admin_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("operator_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("request_id", sa.String(length=64), nullable=False),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("target_type", sa.String(length=40), nullable=False),
        sa.Column("target_id", sa.String(length=100), nullable=False),
        sa.Column("before_data", sa.JSON(), nullable=True),
        sa.Column("after_data", sa.JSON(), nullable=True),
        sa.Column("reason", sa.String(length=500), nullable=True),
        sa.Column("idempotency_key", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("idempotency_key", name="uq_admin_logs_idempotency_key"),
    )
    op.create_index("ix_admin_logs_operator_created", "admin_logs", ["operator_id", "created_at"])
    op.create_index("ix_admin_logs_target", "admin_logs", ["target_type", "target_id"])


def downgrade():
    op.drop_index("ix_admin_logs_target", table_name="admin_logs")
    op.drop_index("ix_admin_logs_operator_created", table_name="admin_logs")
    op.drop_table("admin_logs")
    op.drop_table("site_settings")
    op.drop_table("featured_content")

    with op.batch_alter_table("notifications") as batch:
        batch.drop_column("target_type")
    with op.batch_alter_table("comments") as batch:
        batch.drop_constraint("ck_comments_status", type_="check")
    with op.batch_alter_table("users") as batch:
        batch.drop_constraint("fk_users_avatar_media_id_media", type_="foreignkey")
    with op.batch_alter_table("media") as batch:
        batch.drop_constraint("ck_media_status", type_="check")
        batch.drop_constraint("ck_media_bound_type", type_="check")
        batch.drop_constraint("ck_media_kind", type_="check")
        batch.drop_index("ix_media_live_photo_pair_id")
        batch.drop_column("live_photo_pair_id")
        batch.drop_column("deleted_at")
        batch.drop_column("status")
    with op.batch_alter_table("refresh_sessions") as batch:
        batch.drop_column("ip_hash")
        batch.drop_column("user_agent")
        batch.drop_column("last_used_at")
    with op.batch_alter_table("posts") as batch:
        batch.drop_column("slug_candidate")
    with op.batch_alter_table("article_slugs") as batch:
        batch.drop_constraint("uq_article_slugs_current_post", type_="unique")
        batch.drop_constraint("fk_article_slugs_current_post_id_posts", type_="foreignkey")
        batch.drop_column("current_post_id")
    op.execute(sa.text("UPDATE collections SET status = 'archived' WHERE status = 'hidden'"))
    with op.batch_alter_table("collections") as batch:
        batch.drop_constraint("ck_collections_status", type_="check")
        batch.create_check_constraint("ck_collections_status", "status IN ('active', 'archived')")
    # Safe downgrade: allow the retired value for schema compatibility, but
    # never turn login_only rows back into public content.
    with op.batch_alter_table("posts") as batch:
        batch.drop_constraint("ck_posts_visibility", type_="check")
        batch.create_check_constraint(
            "ck_posts_visibility", "visibility IN ('public', 'login_only', 'private')"
        )
