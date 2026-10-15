"""Private per-member spark accounts and durable execution records."""
from datetime import datetime, timezone
from sqlalchemy.dialects.mysql import MEDIUMTEXT

from app.extensions import db
from app.common.time import isoformat_utc


def now_utc():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class SparkAccount(db.Model):
    __tablename__ = "spark_accounts"
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    credential_ciphertext = db.Column(db.Text().with_variant(MEDIUMTEXT(), "mysql"), nullable=True)
    credential_revision = db.Column(db.Integer, nullable=False, default=0)
    plan_revision = db.Column(db.Integer, nullable=False, default=0)
    login_generation = db.Column(db.Integer, nullable=False, default=0)
    account_profile = db.Column(db.JSON, nullable=True, default=dict)
    onboarding_required = db.Column(db.Boolean, nullable=False, default=True)
    config_saved_at = db.Column(db.DateTime, nullable=True)
    validation_fingerprint = db.Column(db.String(64), nullable=True)
    validated_at = db.Column(db.DateTime, nullable=True)
    config = db.Column(db.JSON, nullable=False, default=dict)
    session_status = db.Column(db.String(24), nullable=False, default="unbound")
    credential_updated_at = db.Column(db.DateTime, nullable=True)
    contacts_updated_at = db.Column(db.DateTime, nullable=True)
    harvest_updated_at = db.Column(db.DateTime, nullable=True)
    next_run_at = db.Column(db.DateTime, nullable=True, index=True)
    next_harvest_at = db.Column(db.DateTime, nullable=True, index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=now_utc)
    updated_at = db.Column(db.DateTime, nullable=False, default=now_utc, onupdate=now_utc)


class SparkContact(db.Model):
    __tablename__ = "spark_contacts"
    __table_args__ = (db.UniqueConstraint("account_id", "display_name", name="uq_spark_contact_name"),)
    id = db.Column(db.Integer, primary_key=True)
    account_id = db.Column(db.Integer, db.ForeignKey("spark_accounts.user_id", ondelete="CASCADE"), nullable=False, index=True)
    display_name = db.Column(db.String(191), nullable=False)
    selected = db.Column(db.Boolean, nullable=False, default=False)
    selected_order = db.Column(db.Integer, nullable=True)
    profile = db.Column(db.JSON, nullable=False, default=dict)
    last_sent_at = db.Column(db.DateTime, nullable=True)

    def to_dict(self):
        return {**(self.profile or {}), "id": self.id, "display_name": self.display_name,
                "selected": self.selected, "selected_order": self.selected_order,
                "last_sent_at": isoformat_utc(self.last_sent_at)}


class SparkJob(db.Model):
    __tablename__ = "spark_jobs"
    id = db.Column(db.String(36), primary_key=True)
    account_id = db.Column(db.Integer, db.ForeignKey("spark_accounts.user_id", ondelete="CASCADE"), nullable=False, index=True)
    kind = db.Column(db.String(20), nullable=False)
    source = db.Column(db.String(16), nullable=False)
    dedupe_key = db.Column(db.String(64), nullable=False, unique=True)
    credential_revision = db.Column(db.Integer, nullable=False)
    local_day = db.Column(db.String(10), nullable=False)
    status = db.Column(db.String(24), nullable=False, default="queued", index=True)
    payload = db.Column(db.JSON, nullable=False, default=dict)
    result = db.Column(db.JSON, nullable=False, default=dict)
    scheduled_at = db.Column(db.DateTime, nullable=False, index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=now_utc)
    started_at = db.Column(db.DateTime, nullable=True)
    finished_at = db.Column(db.DateTime, nullable=True)
    cancel_requested = db.Column(db.Boolean, nullable=False, default=False)

    def to_dict(self):
        return {"id": self.id, "kind": self.kind, "source": self.source, "status": self.status,
                "local_day": self.local_day, "result": self.result, "cancel_requested": self.cancel_requested,
                **{key: isoformat_utc(getattr(self, key)) for key in
                   ("scheduled_at", "created_at", "started_at", "finished_at")}}


class SparkDelivery(db.Model):
    __tablename__ = "spark_deliveries"
    __table_args__ = (db.UniqueConstraint("account_id", "local_day", "recipient_key", name="uq_spark_delivery_day"),)
    id = db.Column(db.Integer, primary_key=True)
    account_id = db.Column(db.Integer, db.ForeignKey("spark_accounts.user_id", ondelete="CASCADE"), nullable=False, index=True)
    job_id = db.Column(db.String(36), db.ForeignKey("spark_jobs.id"), nullable=False, index=True)
    local_day = db.Column(db.String(10), nullable=False)
    recipient_key = db.Column(db.String(64), nullable=False)
    display_name = db.Column(db.String(191), nullable=False)
    channel = db.Column(db.String(16), nullable=False)
    status = db.Column(db.String(24), nullable=False)
    reason = db.Column(db.String(255), nullable=False, default="")
    updated_at = db.Column(db.DateTime, nullable=False, default=now_utc, onupdate=now_utc)


class SparkWorkerState(db.Model):
    __tablename__ = "spark_worker_state"
    id = db.Column(db.Integer, primary_key=True)
    heartbeat_at = db.Column(db.DateTime, nullable=False, default=now_utc)


class SparkLoginSession(db.Model):
    __tablename__ = "spark_login_sessions"
    id = db.Column(db.String(36), primary_key=True)
    account_id = db.Column(db.Integer, db.ForeignKey("spark_accounts.user_id", ondelete="CASCADE"), nullable=False, index=True)
    generation = db.Column(db.Integer, nullable=False)
    base_credential_revision = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(24), nullable=False, default="queued", index=True)
    qr_ciphertext = db.Column(db.Text().with_variant(MEDIUMTEXT(), "mysql"), nullable=True)
    qr_updated_at = db.Column(db.DateTime, nullable=True)
    verification_ciphertext = db.Column(db.Text().with_variant(MEDIUMTEXT(), "mysql"), nullable=True)
    verification_revision = db.Column(db.String(36), nullable=True)
    verification_updated_at = db.Column(db.DateTime, nullable=True)
    interaction_ciphertext = db.Column(db.Text, nullable=True)
    interaction_sequence = db.Column(db.Integer, nullable=False, default=0)
    candidate_ciphertext = db.Column(db.Text().with_variant(MEDIUMTEXT(), "mysql"), nullable=True)
    detected_account = db.Column(db.JSON, nullable=False, default=dict)
    reason = db.Column(db.String(255), nullable=False, default="")
    cancel_requested = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, nullable=False, default=now_utc)
    started_at = db.Column(db.DateTime, nullable=True)
    expires_at = db.Column(db.DateTime, nullable=False, index=True)
    finished_at = db.Column(db.DateTime, nullable=True)

    def to_dict(self):
        profile = self.detected_account or {}
        return {"id": self.id, "status": self.status, "reason": self.reason,
                "detected_account": {k: profile.get(k) for k in ("nickname", "short_id", "same_account")},
                "identity_known": bool(profile.get("identity_hash")),
                "has_qr": bool(self.qr_ciphertext),
                "has_verification_preview": self.status == "verifying" and bool(self.verification_ciphertext),
                "verification_revision": self.verification_revision,
                "interaction_sequence": self.interaction_sequence,
                "interaction_pending": bool(self.interaction_ciphertext),
                **{key: isoformat_utc(getattr(self, key)) for key in
                   ("created_at", "started_at", "expires_at", "qr_updated_at", "verification_updated_at", "finished_at")}}
