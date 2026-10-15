"""Tenant-scoped configuration, scheduling, and durable queue operations."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import hashlib
import json
import random
import re
import uuid
from zoneinfo import ZoneInfo

from flask import current_app
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models import SparkAccount, SparkContact, SparkJob, SparkDelivery, SparkWorkerState, User
from app.models.spark import now_utc
from app.common.time import isoformat_utc
from .notifications import notify_send_result

TZ = ZoneInfo("Asia/Shanghai")
DEFAULT_CONFIG = {
    "schedule_time": "21:00", "jitter_minutes": 30, "send_gap_min": 6, "send_gap_max": 12,
    "max_friends_per_run": 20, "messages": ["🔥 续火花", "晚安，明天见", "今天也要开心哦"],
    "auto_run_enabled": False, "allow_first_message": False, "first_message_daily_limit": 1,
    "creator_user_detail_path": "aweme/v1/creator/im/user_detail/", "creator_max_scrolls": 80,
    "schedule_harvest_day": "mon",
}
ACTIVE_JOB_STATUSES = ("queued", "running")
WEEKDAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


class SparkError(ValueError):
    def __init__(self, message, status=422, code="VALIDATION_ERROR"):
        super().__init__(message)
        self.status, self.code = status, code


def get_account(user_id, *, lock=False):
    query = db.select(SparkAccount).where(SparkAccount.user_id == user_id)
    if lock:
        query = query.with_for_update()
    account = db.session.scalar(query)
    if account is None:
        account = SparkAccount(user_id=user_id, config=deepcopy(DEFAULT_CONFIG))
        db.session.add(account)
        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
        account = db.session.scalar(query)
    return account


def config_for(account):
    return {**deepcopy(DEFAULT_CONFIG), **(account.config or {})}


def validate_config(value, previous):
    if not isinstance(value, dict) or set(value) - set(DEFAULT_CONFIG):
        raise SparkError("配置包含不支持的字段。")
    cfg = {**previous, **value}
    if not isinstance(cfg["schedule_time"], str) or not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", cfg["schedule_time"]):
        raise SparkError("发送时间请使用 HH:MM 格式。")
    for key in ("auto_run_enabled", "allow_first_message"):
        if type(cfg[key]) is not bool:
            raise SparkError("开关配置必须是布尔值。")
    bounds = {"jitter_minutes": (0, 120), "send_gap_min": (1, 300), "send_gap_max": (1, 300),
              "max_friends_per_run": (0, 500), "creator_max_scrolls": (1, 200), "first_message_daily_limit": (1, 10)}
    labels = {"jitter_minutes": "时间浮动", "send_gap_min": "好友间隔下限", "send_gap_max": "好友间隔上限",
              "max_friends_per_run": "每次最多好友数", "creator_max_scrolls": "采集滚动次数", "first_message_daily_limit": "首条消息每日上限"}
    for key, (low, high) in bounds.items():
        if type(cfg[key]) is not int or not low <= cfg[key] <= high:
            raise SparkError(f"{labels[key]}必须是 {low}–{high} 范围内的整数。")
    if cfg["send_gap_max"] < cfg["send_gap_min"]:
        raise SparkError("好友间隔上限不能小于下限。")
    messages = cfg["messages"]
    if not isinstance(messages, list) or not 1 <= len(messages) <= 50 or any(
        not isinstance(m, str) or not m.strip() or len(m) > 500 for m in messages
    ):
        raise SparkError("请设置 1–50 条消息模板，每条不超过 500 字。")
    cfg["messages"] = [m.strip() for m in messages]
    if cfg["schedule_harvest_day"] not in (*WEEKDAYS, "off"):
        raise SparkError("请选择有效的每周采集日期。")
    path = cfg["creator_user_detail_path"]
    if not isinstance(path, str) or not re.fullmatch(r"[a-zA-Z0-9_/-]{1,150}", path):
        raise SparkError("采集接口路径格式不正确。")
    return cfg


def local_now(value=None):
    value = value or now_utc()
    return value.replace(tzinfo=timezone.utc).astimezone(TZ)


def next_daily(cfg, now=None):
    local = local_now(now)
    hh, mm = map(int, cfg["schedule_time"].split(":"))
    scheduled = local.replace(hour=hh, minute=mm, second=0, microsecond=0)
    if scheduled <= local:
        scheduled += timedelta(days=1)
    return scheduled.astimezone(timezone.utc).replace(tzinfo=None)


def next_weekly(cfg, now=None):
    day = cfg["schedule_harvest_day"]
    if day == "off":
        return None
    local = local_now(now)
    planned = local.replace(hour=3, minute=0, second=0, microsecond=0)
    planned += timedelta(days=(WEEKDAYS.index(day) - local.weekday()) % 7)
    if planned <= local:
        planned += timedelta(days=7)
    return planned.astimezone(timezone.utc).replace(tzinfo=None)


def reset_schedule(account, now=None):
    cfg = config_for(account)
    eligible = account.credential_ciphertext and account.session_status not in ("expired", "blocked", "error")
    account.next_run_at = next_daily(cfg, now) if eligible and cfg["auto_run_enabled"] else None
    account.next_harvest_at = next_weekly(cfg, now) if eligible else None


def cancel_jobs(account, *, automatic_only=False):
    query = db.select(SparkJob).where(SparkJob.account_id == account.user_id, SparkJob.status.in_(ACTIVE_JOB_STATUSES))
    if automatic_only:
        query = query.where(SparkJob.source != "manual")
    for job in db.session.scalars(query):
        job.cancel_requested = True
        if job.status == "queued":
            job.status, job.finished_at = "cancelled", now_utc()
            notify_send_result(job)


def contacts_for(account):
    return db.session.scalars(db.select(SparkContact).where(SparkContact.account_id == account.user_id)
                              .order_by(SparkContact.selected.desc(), SparkContact.selected_order, SparkContact.id)).all()


def selected_contacts(account):
    return [c for c in contacts_for(account) if c.selected]


def validation_fingerprint(account):
    cfg = config_for(account)
    targets = [{"id": c.id, "name": c.display_name, "order": c.selected_order,
                "profile": {k: c.profile.get(k) for k in ("has_conversation", "ambiguous", "missing_in_sync", "short_id", "user_id")}}
               for c in selected_contacts(account)]
    return hashlib.sha256(json.dumps({"credential": account.credential_revision, "targets": targets,
        "allow_first_message": cfg["allow_first_message"], "messages": cfg["messages"]},
        sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def validation_ready(account):
    return bool(account.validated_at and account.validation_fingerprint == validation_fingerprint(account)
                and selected_contacts(account) and account.session_status == "ready")


def require_plan_validation(account):
    if account.onboarding_required and (not account.config_saved_at or not validation_ready(account)):
        raise SparkError("请先保存问候计划，并对当前账号和好友完成模拟检查。", 409, "SPARK_CHECK_REQUIRED")


def enqueue(account, kind, source, request_key, *, scheduled_at=None, only_names=None, local_day=None):
    if not account.credential_ciphertext:
        raise SparkError("请先导入抖音登录态。", 409, "SPARK_NOT_BOUND")
    if kind in ("send", "dry_run") and not selected_contacts(account):
        raise SparkError("请先选择至少一位好友。")
    if kind == "send" and account.session_status in ("expired", "blocked", "error"):
        raise SparkError("请先更新登录态或重新验证账号状态。", 409, "SPARK_SESSION_UNAVAILABLE")
    plan = account.plan_revision if source in ("daily", "weekly") else 0
    key = hashlib.sha256(f"{account.user_id}:{account.credential_revision}:{plan}:{kind}:{source}:{request_key}".encode()).hexdigest()
    existing = db.session.scalar(db.select(SparkJob).where(SparkJob.dedupe_key == key))
    if existing:
        if source == "retry" and existing.status == "queued":
            names = list(dict.fromkeys((existing.payload or {}).get("only_names", []) + (only_names or [])))
            existing.payload = {"only_names": names[:500]}
        return existing
    # The account row is held by the caller, serializing requests for this member.
    if source == "manual" and db.session.scalar(db.select(SparkJob.id).where(
        SparkJob.account_id == account.user_id, SparkJob.status.in_(ACTIVE_JOB_STATUSES)
    ).limit(1)):
        raise SparkError("已有任务在排队或运行，请等待完成后再试。", 409, "SPARK_BUSY")
    job = SparkJob(id=str(uuid.uuid4()), account_id=account.user_id, kind=kind, source=source,
                   dedupe_key=key, credential_revision=account.credential_revision,
                   local_day=local_day or local_now().date().isoformat(), scheduled_at=scheduled_at or now_utc(),
                   payload={"only_names": only_names} if only_names is not None else {}, result={})
    db.session.add(job)
    db.session.flush()
    return job


def schedule_due(now=None):
    now = now or now_utc()
    accounts = db.session.scalars(db.select(SparkAccount).join(User, User.id == SparkAccount.user_id)
        .where(User.status == "active", SparkAccount.credential_ciphertext.is_not(None))
        .with_for_update()).all()
    for account in accounts:
        cfg = config_for(account)
        if account.onboarding_required and cfg["auto_run_enabled"] and not validation_ready(account):
            account.config = {**cfg, "auto_run_enabled": False}
            cancel_jobs(account, automatic_only=True)
            reset_schedule(account, now)
            cfg = config_for(account)
        if account.session_status in ("expired", "blocked", "error"):
            continue
        if cfg["auto_run_enabled"] and account.next_run_at and account.next_run_at <= now:
            due = account.next_run_at
            # No messages for missed previous days after a prolonged outage.
            if local_now(due).date() == local_now(now).date() and selected_contacts(account):
                delay = random.uniform(0, cfg["jitter_minutes"] * 60)
                enqueue(account, "send", "daily", local_now(due).date().isoformat(),
                        scheduled_at=now + timedelta(seconds=delay), local_day=local_now(due).date().isoformat())
            account.next_run_at = next_daily(cfg, now)
        if account.next_harvest_at and account.next_harvest_at <= now:
            enqueue(account, "harvest", "weekly", account.next_harvest_at.isoformat(), scheduled_at=now)
            account.next_harvest_at = next_weekly(cfg, now)
    db.session.commit()


def queue_snapshot(now):
    """Anonymous workload only; other members' task details stay private."""
    from app.models import SparkLoginSession
    from .login_session import BROWSER
    job_counts = dict(db.session.execute(db.select(SparkJob.status, db.func.count()).where(
        (SparkJob.status == "running") | ((SparkJob.status == "queued") &
        (SparkJob.scheduled_at <= now) & SparkJob.cancel_requested.is_(False))
    ).group_by(SparkJob.status)).all())
    login_counts = dict(db.session.execute(db.select(SparkLoginSession.status, db.func.count()).where(
        SparkLoginSession.expires_at > now,
        SparkLoginSession.status.in_((*BROWSER, "queued")),
        (SparkLoginSession.status != "queued") | SparkLoginSession.cancel_requested.is_(False),
    ).group_by(SparkLoginSession.status)).all())
    return {"mode": "serial", "busy": bool(job_counts.get("running") or any(login_counts.get(status) for status in BROWSER)),
            "ready_count": job_counts.get("queued", 0) + login_counts.get("queued", 0)}


def overview(account):
    now = now_utc()
    worker = db.session.get(SparkWorkerState, 1)
    jobs = db.session.scalars(db.select(SparkJob).where(SparkJob.account_id == account.user_id)
                             .order_by(SparkJob.created_at.desc()).limit(30)).all()
    contacts = contacts_for(account)
    today = local_now(now).date().isoformat()
    creator_count = db.session.scalar(db.select(db.func.count()).select_from(SparkDelivery).where(
        SparkDelivery.account_id == account.user_id, SparkDelivery.local_day == today,
        SparkDelivery.channel == "creator", SparkDelivery.status.in_(("sending", "succeeded", "unknown"))))
    sent_names = set(db.session.scalars(db.select(SparkDelivery.display_name).where(
        SparkDelivery.account_id == account.user_id, SparkDelivery.local_day == today,
        SparkDelivery.status.in_(("checking", "sending", "succeeded", "unknown")))))
    cfg = config_for(account)
    from .login_session import latest_session
    login = latest_session(account)
    if login and login.status in ("queued", "preparing", "waiting_scan", "verifying", "awaiting_confirmation") and login.expires_at <= now:
        from .login_session import finish
        finish(login, "expired", "连接已过期，请重新扫码。")
        db.session.commit()
    steps = [bool(account.credential_ciphertext and account.session_status == "ready"),
             bool(selected_contacts(account)), bool(account.config_saved_at),
             bool(cfg["auto_run_enabled"] and validation_ready(account))]
    profile = account.account_profile or {}
    pending, creator_pending = [], 0
    for contact in contacts:
        if not contact.selected or contact.display_name in sent_names or contact.profile.get("ambiguous") or contact.profile.get("missing_in_sync"):
            continue
        if contact.profile.get("has_conversation"):
            pending.append({"name": contact.display_name, "channel": "consumer"})
        elif cfg["allow_first_message"] and creator_count < cfg["first_message_daily_limit"] and creator_pending < 1:
            pending.append({"name": contact.display_name, "channel": "creator"})
            creator_pending += 1
    maximum = cfg["max_friends_per_run"] or 500
    stats = {"total": len(contacts), "selected": sum(c.selected for c in contacts),
             "with_short_id": sum(bool(c.profile.get("short_id")) for c in contacts),
             "confidence": {"high": sum(c.profile.get("join_confidence") == "high" for c in contacts)},
             "no_conversation": [c.display_name for c in contacts if not c.profile.get("has_conversation")],
             "low_pending": [c.display_name for c in contacts if c.profile.get("join_confidence") != "high" and c.profile.get("has_conversation")],
             "recent_sent_7d": [c.display_name for c in contacts if c.last_sent_at and c.last_sent_at >= now - timedelta(days=7)],
             "top_streak": [{"name": c.display_name, "days": c.profile.get("streak_days", 0)} for c in sorted(contacts, key=lambda c: -c.profile.get("streak_days", 0))[:10]]}
    stats["confidence"]["low"] = len(contacts) - stats["confidence"]["high"]
    return {"bound": bool(account.credential_ciphertext), "session_status": account.session_status,
            "account_profile": {k: profile.get(k) for k in ("nickname", "short_id", "bound_via", "plan_was_enabled")},
            "login_session": login.to_dict() if login else None,
            "step_progress": {"completed": steps, "current_step": next((i + 1 for i, done in enumerate(steps) if not done), 4)},
            "validation_ready": validation_ready(account),
            "reconnection_diff": {"missing_selected": [c.display_name for c in contacts if c.selected and c.profile.get("missing_in_sync")],
                                  "ambiguous_selected": [c.display_name for c in contacts if c.selected and c.profile.get("ambiguous")]},
            "credential_updated_at": isoformat_utc(account.credential_updated_at), "config": config_for(account),
            "next_run_at": isoformat_utc(account.next_run_at), "next_harvest_at": isoformat_utc(account.next_harvest_at),
            "contacts_updated_at": isoformat_utc(account.contacts_updated_at), "contacts": [c.to_dict() for c in contacts],
            "selected_count": sum(c.selected for c in contacts), "creator_sent_today": creator_count,
            "ledger_stats": stats, "pending_send": pending[:maximum],
            "jobs": [j.to_dict() for j in jobs], "timezone": "Asia/Shanghai",
            "queue": queue_snapshot(now),
            "credential_storage_ready": bool(current_app.config.get("SPARK_CREDENTIAL_KEY")),
            "worker": {"online": bool(worker and now - worker.heartbeat_at < timedelta(seconds=30)),
                       "heartbeat_at": isoformat_utc(worker.heartbeat_at) if worker else None}}
