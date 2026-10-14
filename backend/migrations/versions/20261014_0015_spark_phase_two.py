"""Private QR login sessions and explicit onboarding validation.

Revision ID: 20261014_0015
Revises: 20261014_0014
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.mysql import MEDIUMTEXT

revision = "20261014_0015"
down_revision = "20261014_0014"
branch_labels = None
depends_on = None


def upgrade():
    if not op.get_context().as_sql:
        accounts = sa.table("spark_accounts", sa.column("user_id", sa.Integer), sa.column("config", sa.JSON))
        connection = op.get_bind()
        for user_id, config in connection.execute(sa.select(accounts.c.user_id, accounts.c.config)).all():
            if "auto_run_enabled" not in (config or {}):
                connection.execute(accounts.update().where(accounts.c.user_id == user_id).values(config={"auto_run_enabled": True, **(config or {})}))
    with op.batch_alter_table("spark_accounts") as batch:
        batch.add_column(sa.Column("login_generation", sa.Integer(), nullable=False, server_default="0"))
        batch.add_column(sa.Column("account_profile", sa.JSON(), nullable=True))
        # Existing accounts keep their enabled plans; new accounts use Python default True.
        batch.add_column(sa.Column("onboarding_required", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch.add_column(sa.Column("config_saved_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("validation_fingerprint", sa.String(64), nullable=True))
        batch.add_column(sa.Column("validated_at", sa.DateTime(), nullable=True))
    op.create_table("spark_login_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("spark_accounts.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("generation", sa.Integer(), nullable=False),
        sa.Column("base_credential_revision", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("qr_ciphertext", sa.Text().with_variant(MEDIUMTEXT(), "mysql")),
        sa.Column("qr_updated_at", sa.DateTime()),
        sa.Column("candidate_ciphertext", sa.Text().with_variant(MEDIUMTEXT(), "mysql")),
        sa.Column("detected_account", sa.JSON(), nullable=False),
        sa.Column("reason", sa.String(255), nullable=False),
        sa.Column("cancel_requested", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("started_at", sa.DateTime()),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("finished_at", sa.DateTime()))
    for field in ("account_id", "status", "expires_at"):
        op.create_index(f"ix_spark_login_sessions_{field}", "spark_login_sessions", [field])


def downgrade():
    op.drop_table("spark_login_sessions")
    with op.batch_alter_table("spark_accounts") as batch:
        for field in ("validated_at", "validation_fingerprint", "config_saved_at", "onboarding_required", "account_profile", "login_generation"):
            batch.drop_column(field)
