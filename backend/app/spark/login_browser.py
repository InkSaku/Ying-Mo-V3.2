"""Official-page QR observation; never solves platform challenges or sends messages."""
import hashlib
import base64
import json
import time
from urllib.parse import parse_qs, urlsplit

from .credentials import validate_state


class LoginBrowserError(Exception):
    def __init__(self, status, reason):
        self.status, self.reason = status, reason
        super().__init__(reason)


def identity_profile(state, display=None):
    uid = next((c["value"] for c in state["cookies"] if c["name"] == "uid_tt" and c["value"]), None)
    display = display or {}
    return {"identity_source": "douyin:uid_tt" if uid else None,
            "identity_hash": hashlib.sha256(f"douyin:uid_tt:{uid}".encode()).hexdigest() if uid else None,
            "nickname": str(display.get("nickname") or "已登录的抖音账号")[:100],
            "short_id": str(display.get("unique_id") or "")[:100]}


def login_challenge(page):
    # "验证码登录" is a normal login tab, not a challenge.
    if "验证码中间页" in page.title():
        return True
    for text in ("拖动滑块完成验证", "请完成下方验证", "请进行安全验证", "操作太频繁", "操作频繁"):
        if page.get_by_text(text, exact=True).count() and page.get_by_text(text, exact=True).first.is_visible():
            return True
    return False


def qr_locator(page):
    # The outer animate_qrcode_container also displays "how to scan" artwork.
    # Only the actual QR image inside the official login component is a QR.
    locator = page.locator('#douyin_login_comp_scan_code').get_by_role("img", name="二维码", exact=True)
    if locator.count() and locator.first.is_visible():
        return locator.first
    return None


def qr_bytes(locator):
    source = locator.get_attribute("src") or ""
    prefix = "data:image/png;base64,"
    if not source.startswith(prefix):
        raise LoginBrowserError("interrupted", "登录二维码图片尚未准备好，请重新连接。")
    try:
        image = base64.b64decode(source[len(prefix):], validate=True)
    except ValueError:
        raise LoginBrowserError("interrupted", "登录二维码图片无效，请重新连接。") from None
    if not image.startswith(b"\x89PNG\r\n\x1a\n") or len(image) > 512 * 1024:
        raise LoginBrowserError("interrupted", "登录二维码图片无效，请重新连接。")
    return image


def issued_qr_bytes(data):
    if not isinstance(data, dict) or type(data.get("error_code")) is not int or data["error_code"] != 0:
        return None
    raw = data.get("qrcode")
    if not isinstance(raw, str):
        return None
    try:
        decoded = base64.b64decode(raw.removeprefix("data:image/png;base64,"), validate=True)
    except ValueError:
        return None
    return decoded if decoded.startswith(b"\x89PNG\r\n\x1a\n") and len(decoded) <= 512 * 1024 else None


def qr_requires_verification(payload):
    """A second-step decision, not proof that an SMS prompt is displayed."""
    data = payload.get("data") if isinstance(payload, dict) else None
    return isinstance(data, dict) and type(data.get("error_code")) is int and data["error_code"] == 2046


def verification_methods(data):
    """Keep known platform method enums, never tickets, phone numbers or URLs."""
    known = {"sms", "mobile_sms_verify", "mobile_sms_check_or_verify", "push_verify", "qrcode_verify",
             "face_verify", "password_verify", "email_verify"}
    methods = data.get("verify_ways") if isinstance(data, dict) else None
    if not isinstance(methods, list):
        return []
    return sorted({value for item in methods[:20]
                   if isinstance(value := item.get("verify_way") if isinstance(item, dict) else item, str)
                   and value in known})


def login_handoff_reason(signal):
    methods = signal.get("verification_methods", [])
    if any(method in methods for method in ("sms", "mobile_sms_verify", "mobile_sms_check_or_verify")):
        return "抖音网页登录返回了短信验证要求，手机扫码确认后尚未生成登录态。请在官方电脑网页完成提示，或使用备用扫码脚本完成登录后导入。"
    if "push_verify" in methods:
        return "抖音网页登录还需要已登录设备确认，尚未生成登录态。请检查抖音内的登录确认通知；也可在官方电脑网页或备用扫码脚本中完成登录。"
    return "已收到扫码登录响应，但抖音网页没有完成登录，尚未获取有效登录态。请在官方电脑网页查看具体提示，或使用备用扫码脚本完成登录后导入。"


def login_handoff_prompt(methods):
    if "push_verify" in methods:
        return "抖音正在等待已登录设备确认，请留意抖音里的登录确认通知。确认后保持此页打开，等待网页登录完成。"
    if any(method in methods for method in ("sms", "mobile_sms_verify", "mobile_sms_check_or_verify")):
        return "抖音网页登录返回了短信验证要求，正在等待官方页面处理。若本页不能继续，可使用备用扫码脚本，在官方浏览器中完成验证后导入。"
    return "已收到扫码登录响应，正在等待抖音网页写入登录凭证，请保持此页打开。"


def clean_browser_state(captured):
    # The official page can set a nameless visitor cookie, which has no
    # authentication purpose. Keep file-upload validation strict.
    return validate_state(json.dumps({**captured, "cookies": [c for c in captured["cookies"] if c.get("name")]}).encode())


def observe_login(on_qr, on_status, assert_current, timeout=170):
    # Leave time to commit a specific outcome before the worker's 180s lease.
    from playwright.sync_api import sync_playwright
    display = {}
    scan_signal = {}
    issue_signal = {}
    issued_qr = None
    issued_token = None
    handoff_observed = False
    status = None
    reported_methods = None
    signal_revision = 0
    deadline = time.monotonic() + timeout
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, chromium_sandbox=True, args=["--disable-dev-shm-usage"])
        try:
            context = browser.new_context(viewport={"width": 1366, "height": 800}, locale="zh-CN")
            page = context.new_page()
            def observe_profile(response):
                nonlocal issued_qr, issued_token, handoff_observed, signal_revision
                url = urlsplit(response.url)
                if url.hostname and (url.hostname == "douyin.com" or url.hostname.endswith(".douyin.com")) and "passport" in url.path and any(word in url.path for word in ("qr", "scan")):
                    try:
                        payload = response.json()
                        if not isinstance(payload, dict):
                            return
                        data = payload.get("data", {})
                        if "check_qrconnect" in url.path:
                            request_token = parse_qs(url.query).get("token", [None])[0]
                            if issued_token and request_token and request_token != issued_token:
                                return  # A late poll for the previous QR must not terminate this one.
                        if "get_qrcode" in url.path and isinstance(data, dict):
                            issue_signal.update({"keys": sorted(data), "error_code": data.get("error_code") if type(data.get("error_code")) is int else None})
                            decoded = issued_qr_bytes(data)
                            if decoded:
                                issued_qr = decoded
                                issued_token = data.get("token") if isinstance(data.get("token"), str) else None
                                handoff_observed = False
                                issue_signal["has_png"] = True
                        scan_signal.clear()
                        scan_signal.update({"path": url.path, "http_status": response.status,
                                            "keys": sorted(payload), "data_keys": sorted(data) if isinstance(data, dict) else []})
                        for field in ("status", "error_code", "status_code"):
                            for prefix, part in (("top", payload), ("data", data)):
                                value = part.get(field) if isinstance(part, dict) else None
                                if type(value) in (int, bool) or (isinstance(value, str) and len(value) <= 24 and value.replace("_", "").isalnum()):
                                    scan_signal[f"{prefix}_{field}"] = value
                        if "check_qrconnect" in url.path and isinstance(data, dict):
                            scan_signal.update({"verification_methods": verification_methods(data),
                                "has_verification_url": bool(data.get("url")),
                                "has_captcha": bool(data.get("captcha"))})
                            if qr_requires_verification(payload) or data.get("status") in ("confirmed", "3", 3):
                                handoff_observed = True
                        signal_revision += 1
                    except Exception:
                        pass
                if url.hostname != "www.douyin.com" or "/user/profile/self/" not in url.path:
                    return
                try:
                    user = response.json().get("user", {})
                    if isinstance(user, dict):
                        display.update({k: user[k] for k in ("nickname", "unique_id") if isinstance(user.get(k), str)})
                except Exception:
                    pass
            page.on("response", observe_profile)
            # The chat route renders the official login modal without navigating home.
            page.goto("https://www.douyin.com/chat", wait_until="domcontentloaded", timeout=30000)
            previous = None
            sampled_at = 0
            sampled_revision = -1
            while time.monotonic() < deadline:
                assert_current()
                cookies = context.cookies()
                has_session = any(c["name"].startswith("sessionid") and c["value"] for c in cookies)
                if time.monotonic() - sampled_at > 4 or sampled_revision != signal_revision or has_session:
                    # Only cookie names and structural signals, never cookie values,
                    # profile text, response URLs with queries, or contact names.
                    url = urlsplit(page.url)
                    visible_challenge = login_challenge(page)
                    diagnostics = {"cookie_names": sorted({c["name"] for c in cookies}),
                        "page_host": url.hostname, "page_path": url.path,
                        "qr_nodes": page.locator("#animate_qrcode_container").count(),
                        "conversation_nodes": page.locator(".conversationConversationItemtitle").count(),
                        "scan_signal": dict(scan_signal), "issue_signal": dict(issue_signal),
                        "visible_challenge": visible_challenge, "handoff_observed": handoff_observed}
                    on_status("diagnostic", diagnostics)
                    sampled_at = time.monotonic()
                    sampled_revision = signal_revision
                if has_session:
                    on_status("verifying")
                    page.wait_for_timeout(1500)
                    assert_current()
                    state = clean_browser_state(context.storage_state())
                    return state, identity_profile(state, display)
                if scan_signal.get("data_error_code") == 0:
                    if scan_signal.get("data_status") in ("refused", "4", 4):
                        raise LoginBrowserError("cancelled", "抖音扫码登录已被拒绝，本次连接已结束。")
                    if scan_signal.get("data_status") in ("expired", "5", 5):
                        raise LoginBrowserError("expired", "抖音登录二维码已过期，请重新连接。")
                if login_challenge(page):
                    raise LoginBrowserError("blocked", "抖音官方网页显示了安全验证，登录尚未完成。请使用备用扫码脚本，在弹出的官方浏览器中本人完成验证后导入登录态。")
                # The official SDK handles 2046 through its verification flow.
                # Keep that browser alive for late cookies / phone confirmation;
                # never turn the protocol response itself into a successful login.
                next_status = "verifying" if handoff_observed else "waiting_scan"
                methods = scan_signal.get("verification_methods", [])
                if handoff_observed and (status != next_status or methods != reported_methods):
                    on_status(next_status, {"verification_methods": methods})
                    status = next_status
                    reported_methods = methods
                qr = qr_locator(page)
                if qr and not handoff_observed:
                    for text in ("二维码已失效", "二维码失效", "二维码已过期", "刷新二维码"):
                        message = page.get_by_text(text, exact=False)
                        if message.count() and message.first.is_visible():
                            raise LoginBrowserError("expired", "二维码已失效，请重新连接。")
                    if issued_qr is None:
                        page.wait_for_timeout(1500)
                        continue
                    image = issued_qr
                    digest = hashlib.sha256(image).digest()
                    if digest != previous:
                        on_qr(image)
                        previous = digest
                        status = "waiting_scan"
                page.wait_for_timeout(1500)
            if handoff_observed:
                raise LoginBrowserError("interrupted", login_handoff_reason(scan_signal))
            raise LoginBrowserError("expired", "等待扫码超时，请重新连接。")
        finally:
            browser.close()
