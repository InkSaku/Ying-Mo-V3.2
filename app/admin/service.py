from flask import g, request

from app.extensions import db
from app.models import AdminLog


def admin_reason(data, *, required=True):
    reason = data.get("reason") if isinstance(data, dict) else None
    if reason is not None and not isinstance(reason, str):
        return None
    reason = reason.strip()[:500] if isinstance(reason, str) else None
    if required and not reason:
        return None
    return reason


def record_admin_log(actor, action, target_type, target_id, *, before=None, after=None, reason=None):
    idempotency_key = request.headers.get("Idempotency-Key")
    if idempotency_key:
        idempotency_key = idempotency_key.strip()[:100] or None
    row = AdminLog(
        operator_id=actor.id,
        request_id=getattr(g, "request_id", "unknown"),
        action=action,
        target_type=target_type,
        target_id=str(target_id),
        before_data=before,
        after_data=after,
        reason=reason,
        idempotency_key=idempotency_key,
    )
    db.session.add(row)
    return row
