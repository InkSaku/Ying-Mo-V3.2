"""Bounded, encrypted input for a member's current official login screen."""
from datetime import timedelta
import json

from app.models.spark import now_utc
from .credentials import credential_cipher
from .service import SparkError

WIDTH, HEIGHT = 1366, 800


def validate_action(action):
    if not isinstance(action, dict):
        raise SparkError("登录操作格式不正确。")
    kind = action.get("type")
    fields = {"click": {"type", "x", "y"}, "drag": {"type", "x", "y", "end_x", "end_y"},
              "text": {"type", "text"}, "key": {"type", "key"}, "scroll": {"type", "delta"}}
    if not isinstance(kind, str) or kind not in fields or set(action) != fields[kind]:
        raise SparkError("不支持的登录操作。")
    for field, limit in (("x", WIDTH), ("end_x", WIDTH), ("y", HEIGHT), ("end_y", HEIGHT)):
        if field in action and (type(action[field]) is not int or not 0 <= action[field] < limit):
            raise SparkError("请在官方登录画面内操作。")
    if kind == "text" and (not isinstance(action["text"], str) or not action["text"].isascii()
                            or not action["text"].isdigit() or not 1 <= len(action["text"]) <= 20):
        raise SparkError("这里只能填入 1–20 位数字，请按官方页面提示输入。")
    if kind == "key" and action["key"] not in ("Tab", "Backspace", "Enter", "Escape"):
        raise SparkError("不支持的按键。")
    if kind == "scroll" and (type(action["delta"]) is not int or action["delta"] not in (-500, 500)):
        raise SparkError("不支持的滚动操作。")
    return action


def require_preview(account, session):
    from .login_session import valid_session
    if not valid_session(account, session) or session.status != "verifying" or not session.verification_ciphertext:
        raise SparkError("本次登录画面已结束或尚未准备好，请刷新连接状态。", 409, "SPARK_PREVIEW_UNAVAILABLE")
    if not session.verification_updated_at or session.verification_updated_at < now_utc() - timedelta(seconds=15):
        raise SparkError("登录画面正在更新，请稍后重试。", 409, "SPARK_PREVIEW_STALE")


def queue_interaction(account, session, data):
    require_preview(account, session)
    if not isinstance(data, dict) or set(data) != {"revision", "sequence", "action"}:
        raise SparkError("登录操作格式不正确。")
    action = validate_action(data["action"])
    if data["revision"] != session.verification_revision or type(data["sequence"]) is not int or data["sequence"] != session.interaction_sequence:
        raise SparkError("登录画面已更新，请查看最新画面后操作。", 409, "SPARK_PREVIEW_STALE")
    if session.interaction_ciphertext:
        raise SparkError("上一步正在处理，请稍后再操作。", 409, "SPARK_INPUT_PENDING")
    session.interaction_ciphertext = credential_cipher().encrypt(json.dumps({"revision": data["revision"], "action": action}).encode()).decode()
    session.interaction_sequence += 1
