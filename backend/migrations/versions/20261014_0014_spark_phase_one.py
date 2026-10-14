"""spark_phase_one

Revision ID: 20261014_0014
Revises: 20260908_0013
Create Date: 2026-10-14 12:18:52.644076
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.mysql import MEDIUMTEXT


revision = '20261014_0014'
down_revision = '20260908_0013'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('spark_worker_state',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('heartbeat_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('spark_accounts',
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('credential_ciphertext', sa.Text().with_variant(MEDIUMTEXT(), 'mysql'), nullable=True),
    sa.Column('credential_revision', sa.Integer(), nullable=False),
    sa.Column('plan_revision', sa.Integer(), nullable=False),
    sa.Column('config', sa.JSON(), nullable=False),
    sa.Column('session_status', sa.String(length=24), nullable=False),
    sa.Column('credential_updated_at', sa.DateTime(), nullable=True),
    sa.Column('contacts_updated_at', sa.DateTime(), nullable=True),
    sa.Column('harvest_updated_at', sa.DateTime(), nullable=True),
    sa.Column('next_run_at', sa.DateTime(), nullable=True),
    sa.Column('next_harvest_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('user_id')
    )
    op.create_index(op.f('ix_spark_accounts_next_harvest_at'), 'spark_accounts', ['next_harvest_at'], unique=False)
    op.create_index(op.f('ix_spark_accounts_next_run_at'), 'spark_accounts', ['next_run_at'], unique=False)
    op.create_table('spark_contacts',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('account_id', sa.Integer(), nullable=False),
    sa.Column('display_name', sa.String(length=191), nullable=False),
    sa.Column('selected', sa.Boolean(), nullable=False),
    sa.Column('selected_order', sa.Integer(), nullable=True),
    sa.Column('profile', sa.JSON(), nullable=False),
    sa.Column('last_sent_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['account_id'], ['spark_accounts.user_id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('account_id', 'display_name', name='uq_spark_contact_name')
    )
    op.create_index(op.f('ix_spark_contacts_account_id'), 'spark_contacts', ['account_id'], unique=False)
    op.create_table('spark_jobs',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('account_id', sa.Integer(), nullable=False),
    sa.Column('kind', sa.String(length=20), nullable=False),
    sa.Column('source', sa.String(length=16), nullable=False),
    sa.Column('dedupe_key', sa.String(length=64), nullable=False),
    sa.Column('credential_revision', sa.Integer(), nullable=False),
    sa.Column('local_day', sa.String(length=10), nullable=False),
    sa.Column('status', sa.String(length=24), nullable=False),
    sa.Column('payload', sa.JSON(), nullable=False),
    sa.Column('result', sa.JSON(), nullable=False),
    sa.Column('scheduled_at', sa.DateTime(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('started_at', sa.DateTime(), nullable=True),
    sa.Column('finished_at', sa.DateTime(), nullable=True),
    sa.Column('cancel_requested', sa.Boolean(), nullable=False),
    sa.ForeignKeyConstraint(['account_id'], ['spark_accounts.user_id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('dedupe_key')
    )
    op.create_index(op.f('ix_spark_jobs_account_id'), 'spark_jobs', ['account_id'], unique=False)
    op.create_index(op.f('ix_spark_jobs_scheduled_at'), 'spark_jobs', ['scheduled_at'], unique=False)
    op.create_index(op.f('ix_spark_jobs_status'), 'spark_jobs', ['status'], unique=False)
    op.create_table('spark_deliveries',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('account_id', sa.Integer(), nullable=False),
    sa.Column('job_id', sa.String(length=36), nullable=False),
    sa.Column('local_day', sa.String(length=10), nullable=False),
    sa.Column('recipient_key', sa.String(length=64), nullable=False),
    sa.Column('display_name', sa.String(length=191), nullable=False),
    sa.Column('channel', sa.String(length=16), nullable=False),
    sa.Column('status', sa.String(length=24), nullable=False),
    sa.Column('reason', sa.String(length=255), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['account_id'], ['spark_accounts.user_id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['job_id'], ['spark_jobs.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('account_id', 'local_day', 'recipient_key', name='uq_spark_delivery_day')
    )
    op.create_index(op.f('ix_spark_deliveries_account_id'), 'spark_deliveries', ['account_id'], unique=False)
    op.create_index(op.f('ix_spark_deliveries_job_id'), 'spark_deliveries', ['job_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_spark_deliveries_job_id'), table_name='spark_deliveries')
    op.drop_index(op.f('ix_spark_deliveries_account_id'), table_name='spark_deliveries')
    op.drop_table('spark_deliveries')
    op.drop_index(op.f('ix_spark_jobs_status'), table_name='spark_jobs')
    op.drop_index(op.f('ix_spark_jobs_scheduled_at'), table_name='spark_jobs')
    op.drop_index(op.f('ix_spark_jobs_account_id'), table_name='spark_jobs')
    op.drop_table('spark_jobs')
    op.drop_index(op.f('ix_spark_contacts_account_id'), table_name='spark_contacts')
    op.drop_table('spark_contacts')
    op.drop_index(op.f('ix_spark_accounts_next_run_at'), table_name='spark_accounts')
    op.drop_index(op.f('ix_spark_accounts_next_harvest_at'), table_name='spark_accounts')
    op.drop_table('spark_accounts')
    op.drop_table('spark_worker_state')
