"""Conservative, explicit recovery of plans paused by first-harvest enrichment.

No browser work, jobs or messages are created. Unproven or deliberately paused
plans remain untouched. Run through the admin CLI, previewing before --apply.
"""
from datetime import timedelta
import hashlib

from app.extensions import db
from app.models import SparkAccount, SparkJob, User
from app.models.spark import now_utc
from .service import (_plan_fingerprint, config_for, next_daily, resume_schedule,
                      selected_contacts, validation_fingerprint, validation_ready)


def harvest_pause_evidence(account):
    cfg = config_for(account)
    if (cfg["auto_run_enabled"] or not account.onboarding_required
            or account.session_status != "ready" or not account.credential_ciphertext
            or not account.validated_at or not account.validation_fingerprint
            or not account.config_saved_at or account.config_saved_at > account.validated_at
            or account.next_run_at is not None or validation_ready(account)):
        return None
    contacts = selected_contacts(account)
    if not contacts or any(not c.profile.get("has_conversation") or c.profile.get("ambiguous")
                           or c.profile.get("missing_in_sync") for c in contacts):
        return None
    # Prove the old successful check matches exactly after removing ONLY the
    # three initially absent fields added by creator harvesting. Message,
    # credential, friend selection/order, conversation and missing flags stay.
    targets = [{"id": c.id, "name": c.display_name, "order": c.selected_order,
                "profile": {"has_conversation": c.profile.get("has_conversation"), "ambiguous": None,
                            "missing_in_sync": c.profile.get("missing_in_sync"), "short_id": None, "user_id": None}}
               for c in contacts]
    if _plan_fingerprint(account, targets) != account.validation_fingerprint:
        return None
    harvest = db.session.scalar(db.select(SparkJob).where(
        SparkJob.account_id == account.user_id, SparkJob.kind == "harvest", SparkJob.status == "succeeded",
        SparkJob.credential_revision == account.credential_revision,
        SparkJob.started_at > account.validated_at,
    ).order_by(SparkJob.finished_at.desc()).limit(1))
    if (not harvest or not harvest.finished_at or not account.updated_at
            or not harvest.finished_at <= account.updated_at <= harvest.finished_at + timedelta(minutes=1)):
        return None
    check = db.session.scalar(db.select(SparkJob).where(
        SparkJob.account_id == account.user_id, SparkJob.kind == "dry_run", SparkJob.status == "succeeded",
        SparkJob.credential_revision == account.credential_revision,
        SparkJob.started_at <= account.validated_at, SparkJob.finished_at >= account.validated_at,
        SparkJob.finished_at <= harvest.started_at,
    ).order_by(SparkJob.finished_at.desc()).limit(1))
    events = (check.result or {}).get("events", []) if check else []
    if (len(events) != len(contacts) or {e.get("name") for e in events} != {c.display_name for c in contacts}
            or any(e.get("status") != "succeeded" or e.get("channel") != "consumer" for e in events)):
        return None
    # Explicit pause/config edits increment plan_revision; the automatic bug did
    # not. A matching dedupe key proves this exact plan was previously enabled.
    daily_jobs = db.session.scalars(db.select(SparkJob).where(
        SparkJob.account_id == account.user_id, SparkJob.kind == "send", SparkJob.source == "daily",
        SparkJob.credential_revision == account.credential_revision, SparkJob.created_at <= harvest.started_at,
    ).order_by(SparkJob.created_at.desc()).limit(50)).all()
    if not any(job.dedupe_key == hashlib.sha256(
            f"{account.user_id}:{account.credential_revision}:{account.plan_revision}:send:daily:{job.local_day}".encode()
            ).hexdigest() for job in daily_jobs):
        return None
    return {"harvest_job_id": harvest.id, "check_job_id": check.id}


def repair_harvest_pauses(*, apply=False, now=None):
    now = now or now_utc()
    query = db.select(SparkAccount).join(User, User.id == SparkAccount.user_id).where(
        User.status == "active", SparkAccount.credential_ciphertext.is_not(None))
    if apply:
        query = query.with_for_update()
    recoveries = []
    try:
        for account in db.session.scalars(query).all():
            evidence = harvest_pause_evidence(account)
            if not evidence:
                continue
            recoveries.append({"account_id": account.user_id, **evidence,
                               "next_run_at": next_daily(config_for(account), now).isoformat(), "applied": apply})
            if apply:
                account.validation_fingerprint = validation_fingerprint(account)
                account.config = {**config_for(account), "auto_run_enabled": True}
                resume_schedule(account, now)
                if not validation_ready(account):
                    raise ValueError("Restored plan did not retain its proven successful check")
        if apply:
            db.session.commit()
        else:
            db.session.rollback()
    except Exception:
        db.session.rollback()
        raise
    return {"apply": apply, "recovered_count": len(recoveries), "accounts": recoveries}
