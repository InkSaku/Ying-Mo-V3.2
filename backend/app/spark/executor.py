"""Job execution with an intent journal at the irreversible send boundary."""
from datetime import timedelta
import hashlib
import logging
import random
import time

from app.extensions import db
from app.models import SparkAccount, SparkContact, SparkDelivery, SparkJob, User
from app.models.spark import now_utc
from .notifications import notify_send_result
from .context import _execution
from .credentials import CredentialError, decrypt_state
from .service import (config_for, enqueue, local_now, reset_schedule, resume_schedule, selected_contacts,
                      sending_plan_fingerprint, validation_fingerprint, validation_ready)


class Cancelled(Exception):
    pass


class DailyLimitReached(Exception):
    pass


def creator_daily_count(job):
    return db.session.scalar(db.select(db.func.count()).select_from(SparkDelivery).where(
        SparkDelivery.account_id == job.account_id, SparkDelivery.local_day == job.local_day,
        SparkDelivery.channel == "creator", SparkDelivery.status.in_(("sending", "succeeded", "unknown"))))


def assert_active(job_id):
    db.session.expire_all()
    job = db.session.get(SparkJob, job_id)
    if not job:
        raise Cancelled()
    account = db.session.get(SparkAccount, job.account_id)
    user = db.session.get(User, job.account_id)
    if (job.status != "running" or job.cancel_requested or not user or user.status != "active"
        or not account or not account.credential_ciphertext or account.credential_revision != job.credential_revision
        or (job.source in ("daily", "retry") and not config_for(account)["auto_run_enabled"])
        or (job.kind == "send" and account.session_status in ("expired", "blocked", "error"))
        or (job.kind == "send" and account.onboarding_required and not validation_ready(account))):
        raise Cancelled()
    return job, account


def merge_consumer(account, items):
    contacts = {c.display_name: c for c in db.session.scalars(db.select(SparkContact).where(SparkContact.account_id == account.user_id))}
    found = {str(item.get("name", "")).strip()[:191] for item in items[:500]}
    for name, contact in contacts.items():
        if contact.profile.get("has_conversation"):
            contact.profile = {**contact.profile, "missing_in_sync": name not in found}
    for item in items[:500]:
        name = str(item.get("name", "")).strip()[:191]
        if not name:
            continue
        contact = contacts.get(name)
        if not contact:
            contact = SparkContact(account_id=account.user_id, display_name=name, profile={})
            db.session.add(contact)
            contacts[name] = contact
        import re
        streak = re.search(r"\d+", str(item.get("streak", "")))
        profile = {**(contact.profile or {}), "has_conversation": True, "channel": "consumer", "missing_in_sync": False,
                   "streak_days": int(streak.group()) if streak else 0}
        if profile.get("nickname") == name:
            profile["join_confidence"] = "high"
        contact.profile = profile
    account.contacts_updated_at = now_utc()


def merge_creator(account, mapping):
    contacts = db.session.scalars(db.select(SparkContact).where(SparkContact.account_id == account.user_id)).all()
    normalize = lambda value: str(value).replace("\u00a0", " ").strip()
    for sid, info in list(mapping.items())[:500]:
        name = str(info.get("nickname") or sid).strip()[:191]
        candidates = [c for c in contacts if c.profile.get("short_id") == sid or normalize(c.display_name) in (normalize(name), normalize(sid))]
        contact = next((c for c in candidates if c.profile.get("has_conversation")), next(iter(candidates), None))
        if contact is None:
            contact = SparkContact(account_id=account.user_id, display_name=name, profile={"has_conversation": False, "channel": "creator"})
            db.session.add(contact)
            contacts.append(contact)
        previous = contact.profile or {}
        ambiguous = bool(previous.get("short_id") and previous["short_id"] != sid)
        contact.profile = {**previous, "nickname": name, "short_id": str(sid)[:191],
                           "user_id": str(info.get("user_id", ""))[:191], "ambiguous": ambiguous,
                           "join_confidence": "high" if previous.get("has_conversation") and not ambiguous else "low"}
    account.harvest_updated_at = now_utc()


def reserve_delivery(job, contact, channel):
    key = hashlib.sha256(contact.display_name.replace("\u00a0", " ").strip().encode()).hexdigest()
    existing = db.session.scalar(db.select(SparkDelivery).where(
        SparkDelivery.account_id == job.account_id, SparkDelivery.local_day == job.local_day,
        SparkDelivery.recipient_key == key).with_for_update())
    if existing and existing.status in ("checking", "sending", "succeeded", "unknown"):
        return None
    if existing is None:
        existing = SparkDelivery(account_id=job.account_id, local_day=job.local_day, recipient_key=key,
                                 display_name=contact.display_name, job_id=job.id, channel=channel, status="checking")
        db.session.add(existing)
    else:
        existing.job_id, existing.channel, existing.status, existing.reason = job.id, channel, "checking", ""
    db.session.commit()
    return existing.id


def mark_intent(job_id, delivery_id, limit):
    job, _ = assert_active(job_id)
    delivery = db.session.get(SparkDelivery, delivery_id)
    if delivery.channel == "creator":
        if creator_daily_count(job) >= limit:
            raise DailyLimitReached()
    delivery.status = "sending"
    db.session.commit()


def interrupted(job_id, reason="任务中断，发送结果需要到抖音确认", *, cancelled=False, error_code=None):
    # The parent may still hold a running-job snapshot after the child committed
    # success. Discard that transaction and lock the current row before deciding
    # to interrupt; committed send intents remain the source of truth.
    db.session.rollback()
    job = db.session.scalar(db.select(SparkJob).where(SparkJob.id == job_id).with_for_update()
                            .execution_options(populate_existing=True))
    if not job or job.status != "running":
        db.session.rollback()
        return
    unknown = False
    for delivery in db.session.scalars(db.select(SparkDelivery).where(SparkDelivery.job_id == job_id)):
        if delivery.status == "sending":
            delivery.status, delivery.reason = "unknown", reason
            unknown = True
        elif delivery.status == "checking":
            delivery.status, delivery.reason = "failed", "发送前任务已中断，未发送"
    job.status = "unknown" if unknown else "cancelled" if job.cancel_requested or cancelled else "failed"
    job.result = {**(job.result or {}), "message": reason,
                  **({"error_code": error_code} if error_code else {})}
    job.finished_at = now_utc()
    notify_send_result(job)
    db.session.commit()


def execute_job(job_id, driver_factory=None, *, sleep=time.sleep):
    # Driver injection is solely a Python testing seam; no API can select it.
    if driver_factory is None:
        from .driver import PlaywrightDriver
        driver_factory = PlaywrightDriver
    job = db.session.get(SparkJob, job_id)
    if job is None or job.status not in ("queued", "running"):
        return
    if job.status == "queued":
        job.status, job.started_at = "running", now_utc()
        db.session.commit()
    try:
        job, account = assert_active(job_id)
        cfg = config_for(account)
        state = decrypt_state(account.credential_ciphertext)
        if job.kind == "dry_run":
            account.validation_fingerprint = account.validated_at = None
            db.session.commit()
    except Cancelled:
        job.status, job.finished_at = "cancelled", now_utc()
        notify_send_result(job)
        db.session.commit()
        return
    except CredentialError:
        job.status, job.finished_at = "failed", now_utc()
        job.result = {"message": "无法读取已保存的抖音登录信息，请重新扫码连接。如果仍然失败，请联系网站管理员。",
                      "error_code": "CREDENTIAL_UNREADABLE"}
        account.session_status = "error"
        reset_schedule(account)
        notify_send_result(job)
        db.session.commit()
        return
    if job.kind == "send" and job.local_day != local_now().date().isoformat():
        job.status, job.finished_at = "cancelled", now_utc()
        job.result = {"message": "任务已跨日，取消过期发送。"}
        notify_send_result(job)
        db.session.commit()
        return
    token = _execution.set({"config": cfg, "state": state})
    # Upstream exceptions may include full URLs; persist only our structured events.
    logging.getLogger("douyin-spark").disabled = True
    events = []
    retry_names = []
    try:
        with driver_factory(cfg) as driver:
            if job.kind in ("sync", "harvest"):
                status, data = driver.sync() if job.kind == "sync" else driver.harvest()
                # Discard the browser operation's repeatable-read snapshot before
                # inspecting current selection/configuration. API edits lock the
                # same account row, so refreshing metadata cannot bless a new plan.
                account_id = job.account_id
                db.session.rollback()
                db.session.scalar(db.select(SparkAccount).where(SparkAccount.user_id == account_id).with_for_update())
                db.session.scalar(db.select(SparkJob).where(SparkJob.id == job_id).with_for_update())
                job, account = assert_active(job_id)
                if status == "succeeded":
                    was_validated = validation_ready(account)
                    checked_behavior = sending_plan_fingerprint(account)
                    merge_consumer(account, data) if job.kind == "sync" else merge_creator(account, data)
                    if was_validated:
                        if checked_behavior == sending_plan_fingerprint(account):
                            account.validation_fingerprint = validation_fingerprint(account)
                        else:
                            account.validation_fingerprint = account.validated_at = None
                    account.session_status = "ready"
                    resume_schedule(account)
                elif status in ("expired", "blocked"):
                    account.session_status = status
                    reset_schedule(account)
                job.status = status if status in ("succeeded", "expired", "blocked") else "failed"
                operation = "联系人同步" if job.kind == "sync" else "抖音号采集"
                message = {
                    "succeeded": f"{operation}完成",
                    "expired": f"{operation}未完成：抖音登录已过期，请重新扫码连接。",
                    "blocked": f"{operation}未完成：抖音要求验证或限制了操作，请先在手机抖音查看提示，再重新连接。",
                }.get(status, f"{operation}未完成，请稍后重试。如果多次失败，请联系网站管理员并提供这条记录的时间。")
                job.result = {"message": message, "count": len(data)}
            else:
                targets = selected_contacts(account)
                checked_fingerprint = validation_fingerprint(account)
                only_names = (job.payload or {}).get("only_names")
                if only_names is not None:
                    targets = [c for c in targets if c.display_name in only_names]
                maximum = cfg["max_friends_per_run"]
                targets = targets[:500] if job.kind == "dry_run" else targets[:maximum] if maximum else targets[:500]
                creator_attempts = 0
                for index, contact in enumerate(targets):
                    job, account = assert_active(job_id)
                    # Selection changes take effect before the next recipient.
                    db.session.refresh(contact)
                    if not contact.selected:
                        continue
                    dry = job.kind == "dry_run"
                    if dry:
                        job.result = {"events": list(events), "progress": {
                            "total": len(targets), "completed": len(events), "current_name": contact.display_name,
                        }}
                        db.session.commit()
                    channel = "consumer" if contact.profile.get("has_conversation") else "creator"
                    event = {"name": contact.display_name, "channel": channel}
                    if contact.profile.get("ambiguous"):
                        event.update(status="skipped", reason="同名好友身份尚未确认")
                    elif contact.profile.get("missing_in_sync"):
                        event.update(status="skipped", reason="本次同步未找到该好友，请重新核对")
                    elif channel == "creator" and (not cfg["allow_first_message"] or creator_attempts >= 1):
                        event.update(status="skipped", reason="未启用首条消息或本轮已使用首条消息通道")
                    elif channel == "creator" and not dry and creator_daily_count(job) >= cfg["first_message_daily_limit"]:
                        event.update(status="skipped", reason="今日首条消息已达到上限")
                    else:
                        delivery_id = None if dry else reserve_delivery(job, contact, channel)
                        if not dry and delivery_id is None:
                            event.update(status="skipped", reason="今天已发送或有待确认结果，不会重复发送")
                        else:
                            def before_send():
                                mark_intent(job_id, delivery_id, cfg["first_message_daily_limit"])
                            try:
                                status, reason = driver.send(contact.to_dict(), random.choice(cfg["messages"]), dry, before_send)
                            except Cancelled:
                                raise
                            except DailyLimitReached:
                                status, reason = "skipped", "今日首条消息已达到上限"
                            except Exception:
                                delivery = db.session.get(SparkDelivery, delivery_id) if delivery_id else None
                                status = "unknown" if delivery and delivery.status == "sending" else "failed"
                                reason = ("模拟检查遇到问题，没有发送消息，请稍后重试检查。" if dry
                                          else "发送结果未确认，请到手机抖音核对聊天记录；不会自动重发" if status == "unknown"
                                          else "发送前操作失败，未发送消息")
                            if not dry:
                                delivery = db.session.get(SparkDelivery, delivery_id)
                                attempted = delivery.status == "sending"
                                delivery.status = "unknown" if attempted and status in ("expired", "blocked") else status
                                delivery.reason = reason
                                if status == "succeeded":
                                    contact.last_sent_at = now_utc()
                                if status in ("succeeded", "unknown") and channel == "creator":
                                    creator_attempts += 1
                                if status == "failed":
                                    retry_names.append(contact.display_name)
                            event.update(status=status, reason=reason)
                    events.append(event)
                    job.result = {"events": list(events), **({"progress": {
                        "total": len(targets), "completed": len(events), "current_name": None,
                    }} if dry else {})}
                    db.session.commit()
                    if event["status"] in ("expired", "blocked"):
                        account.session_status = event["status"]
                        reset_schedule(account)
                        break
                    if index < len(targets) - 1:
                        sleep(random.uniform(cfg["send_gap_min"], cfg["send_gap_max"]))
                statuses = {e["status"] for e in events}
                job.status = next((s for s in ("expired", "blocked", "unknown", "failed") if s in statuses), "succeeded")
                if job.kind == "send" and statuses == {"skipped"}:
                    job.status = "skipped"
                if "succeeded" in statuses and job.status == "failed":
                    job.status = "partial"
                if job.status not in ("expired", "blocked") and "succeeded" in statuses:
                    account.session_status = "ready"
                if job.kind == "dry_run" and events and len(events) == len(selected_contacts(account)) and all(e["status"] == "succeeded" for e in events) and checked_fingerprint == validation_fingerprint(account):
                    account.validation_fingerprint, account.validated_at = checked_fingerprint, now_utc()
                if job.kind == "send" and retry_names and job.source != "retry" and job.status not in ("expired", "blocked"):
                    enqueue(account, "send", "retry", f"{job.local_day}:retry", scheduled_at=now_utc() + timedelta(minutes=45),
                            only_names=retry_names, local_day=job.local_day)
                job.result = {"events": events, "summary": {s: sum(e["status"] == s for e in events) for s in statuses}}
                if account.session_status == "ready":
                    # Preserve an existing due time; only restore suspended schedules.
                    if account.next_run_at is None:
                        reset_schedule(account)
        job.finished_at = now_utc()
        notify_send_result(job)
        db.session.commit()
    except Cancelled:
        interrupted(job_id, "任务已停止；已尝试发送的结果需要到抖音确认", cancelled=True)
    except Exception:
        db.session.rollback()
        operation = {"sync": "联系人同步", "harvest": "抖音号采集", "dry_run": "模拟检查", "send": "消息发送"}[job.kind]
        guidance = ("请先到抖音私信核对已发送的消息，再查看每位好友的执行结果，避免重复发送。" if job.kind == "send"
                    else "请稍后重试。如果多次失败，请联系网站管理员并提供这条记录的时间。")
        interrupted(job_id, f"{operation}遇到问题，未能完成。{guidance}", error_code="EXECUTION_FAILED")
    finally:
        _execution.reset(token)
