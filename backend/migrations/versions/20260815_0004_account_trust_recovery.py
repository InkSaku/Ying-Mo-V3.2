"""Add email verification and one-time account recovery tokens.

Revision ID: 20260815_0004
Revises: 20260815_0003
Create Date: 2026-08-15
"""
from alembic import op
import sqlalchemy as sa


revision = "20260815_0004"
down_revision = "20260815_0003"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "account_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("purpose", sa.String(length=32), nullable=False),
        sa.Column("target_email_normalized", sa.String(length=254), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "purpose IN ('email_verification', 'password_reset')",
            name="ck_account_tokens_purpose",
        ),
        sa.UniqueConstraint("token_hash", name="uq_account_tokens_token_hash"),
    )
    op.create_index(
        "ix_account_tokens_user_purpose_created",
        "account_tokens",
        ["user_id", "purpose", "created_at"],
    )
    op.create_index(
        "ix_account_tokens_expires_at",
        "account_tokens",
        ["expires_at"],
    )


def downgrade():
    op.drop_index("ix_account_tokens_expires_at", table_name="account_tokens")
    op.drop_index("ix_account_tokens_user_purpose_created", table_name="account_tokens")
    op.drop_table("account_tokens")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("email_verified_at")
