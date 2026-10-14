"""Official-page QR observation; never solves platform challenges or sends messages."""
import hashlib
import base64
import json
import time
from urllib.parse import urlsplit

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
    data = payload.get("data") if isinstance(payload, dict) else None
    return isinstance(data, dict) and type(data.get("error_code")) is int and data["error_code"] == 2046


def clean_browser_state(captured):
    # The official page can set a nameless visitor cookie, which has no
    # authentication purpose. Keep file-upload validation strict.
    return validate_state(json.dumps({**captured, "cookies": [c for c in captured["cookies"] if c.get("name")]}).encode())


def observe_login(on_qr, on_status, assert_current, timeout=180):
    from playwright.sync_api import sync_playwright
    display = {}
    scan_signal = {}
    issue_signal = {}
    issued_qr = None
    verification_required = False
    deadline = time.monotonic() + timeout
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, chromium_sandbox=True, args=["--disable-dev-shm-usage"])
        try:
            context = browser.new_context(viewport={"width": 1366, "height": 800}, locale="zh-CN")
            page = context.new_page()
            def observe_profile(response):
                nonlocal issued_qr, verification_required
                url = urlsplit(response.url)
                if url.hostname and (url.hostname == "douyin.com" or url.hostname.endswith(".douyin.com")) and "passport" in url.path and any(word in url.path for word in ("qr", "scan")):
                    try:
                        payload = response.json()
                        if "check_qrconnect" in url.path and qr_requires_verification(payload):
                            verification_required = True
                        data = payload.get("data", {})
                        if "get_qrcode" in url.path and isinstance(data, dict):
                            issue_signal.update({"keys": sorted(data), "error_code": data.get("error_code") if type(data.get("error_code")) is int else None})
                            decoded = issued_qr_bytes(data)
                            if decoded:
                                issued_qr = decoded
                                issue_signal["has_png"] = True
                        scan_signal.clear()
                        scan_signal.update({"path": url.path, "http_status": response.status,
                                            "keys": sorted(payload), "data_keys": sorted(data) if isinstance(data, dict) else []})
                        for field in ("status", "error_code", "status_code"):
                            for prefix, part in (("top", payload), ("data", data)):
                                value = part.get(field) if isinstance(part, dict) else None
                                if type(value) in (int, bool) or (isinstance(value, str) and len(value) <= 24 and value.replace("_", "").isalnum()):
                                    scan_signal[f"{prefix}_{field}"] = value
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
            while time.monotonic() < deadline:
                assert_current()
                cookies = context.cookies()
                if time.monotonic() - sampled_at > 4:
                    # Only cookie names and structural signals, never cookie values,
                    # profile text, response URLs with queries, or contact names.
                    url = urlsplit(page.url)
                    diagnostics = {"cookie_names": sorted({c["name"] for c in cookies}),
                        "page_host": url.hostname, "page_path": url.path,
                        "qr_nodes": page.locator("#animate_qrcode_container").count(),
                        "conversation_nodes": page.locator(".conversationConversationItemtitle").count(),
                        "scan_signal": dict(scan_signal), "issue_signal": dict(issue_signal)}
                    on_status("diagnostic", diagnostics)
                    sampled_at = time.monotonic()
                if any(c["name"].startswith("sessionid") and c["value"] for c in cookies):
                    on_status("verifying")
                    page.wait_for_timeout(1500)
                    assert_current()
                    state = clean_browser_state(context.storage_state())
                    return state, identity_profile(state, display)
                if verification_required:
                    raise LoginBrowserError("blocked", "扫码已确认，但抖音还要求额外身份验证。请使用备用扫码脚本，在弹出的官方浏览器中完成验证后导入登录态。")
                if login_challenge(page):
                    raise LoginBrowserError("blocked", "抖音要求安全验证，本次连接未完成，请在官方客户端查看后重试。")
                qr = qr_locator(page)
                if qr:
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
                page.wait_for_timeout(1500)
            raise LoginBrowserError("expired", "等待扫码超时，请重新连接。")
        finally:
            browser.close()
