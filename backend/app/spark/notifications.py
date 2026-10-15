"""Persist one private inbox receipt in the same transaction as a send result."""
from app.extensions import db
from app.models import Notification


def notify_send_result(job):
    if job.kind != "send" or job.status in ("queued", "running"):
        return
    result = job.result or {}
    if result.get("notification_created"):
        return
    events = result.get("events", [])
    counts = {status: sum(e.get("status") == status for e in events)
              for status in ("succeeded", "failed", "skipped", "unknown", "expired", "blocked")}
    label = {"daily": "定时发送", "retry": "自动重试", "manual": "立即发送"}.get(job.source, "发送")
    if job.status == "skipped" or (job.status == "succeeded" and not counts["succeeded"]):
        outcome = "已跳过，本次未发送"
    else:
        outcome = {"succeeded": "成功", "partial": "部分成功", "failed": "失败",
                   "unknown": "结果待确认，请到抖音核对", "expired": "登录态已失效，请重新扫码",
                   "blocked": "需要平台验证，请重新连接", "cancelled": "已取消"}.get(job.status, "已结束")
    details = [f"{title} {counts[status]} 位" for status, title in (
        ("succeeded", "成功"), ("failed", "失败"), ("skipped", "跳过"), ("unknown", "待确认")) if counts[status]]
    reasons = list(dict.fromkeys(e.get("reason") for e in events
                                if e.get("status") != "succeeded" and e.get("reason")))
    if result.get("message"):
        reasons.insert(0, result["message"])
    message = f"续火花{label}：{outcome}。" + "；".join(details + reasons)
    db.session.add(Notification(user_id=job.account_id, kind="spark_send_result",
                                target_type="spark", message=message[:500]))
    job.result = {**result, "notification_created": True}
