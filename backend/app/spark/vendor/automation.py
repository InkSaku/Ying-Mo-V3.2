"""Playwright 自动化：在抖音网页版私信页面给指定好友发送消息。

发送逻辑参考 douyin-cloud-streak（MIT），要点：
- 点击联系人后校验右侧会话确实切换（防止限流时错发给上一个人）；
- 列表点击失败时用搜索框兜底；
- 检测"操作频繁 / 安全验证"等提示，命中即停本轮；
- 发送前清空输入框，发送后校验输入框已清空。
"""

from __future__ import annotations

import logging
import random
import re
import time
from datetime import datetime

from .browser import open_browser
from .config import load_config
from .guard import detect_rate_limit

logger = logging.getLogger("douyin-spark")

CHAT_URL = "https://www.douyin.com/chat"
LOGIN_TEXTS = ["扫码登录", "验证码登录", "登录后查看", "登录后即可"]


def _now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


# ── 登录检测 ──────────────────────────────────────────────────────────────


def check_login(page) -> tuple[bool, str]:
    """返回 (是否已登录, 说明)。宁可误报掉线，也不要带着过期登录态硬跑。"""
    url = page.url
    if "login" in url.lower() or "passport" in url.lower():
        return False, f"页面已跳转到登录页（{url}）"

    try:
        qr = page.locator("#animate_qrcode_container")
        if qr.count() and qr.first.is_visible():
            return False, "页面出现扫码登录二维码，登录态已过期"
    except Exception:
        pass

    for text in LOGIN_TEXTS:
        try:
            loc = page.get_by_text(text, exact=False)
            for i in range(min(loc.count(), 3)):
                if loc.nth(i).is_visible():
                    return False, f"页面出现登录提示「{text}」"
        except Exception:
            continue

    cookies = page.context.cookies()
    if not any(c["name"].startswith("sessionid") for c in cookies):
        return False, "未检测到 sessionid Cookie"
    return True, "ok"


# ── 联系人定位 ────────────────────────────────────────────────────────────


def _find_contact(page, name: str):
    """优先按全文精确匹配联系人标题，避免误点其他会话里的消息预览。"""
    exact = page.get_by_text(name, exact=True)
    if exact.count():
        return exact.first
    return exact.first


def _verify_in_conversation(page, name: str) -> bool:
    """右侧会话顶部标题区域（x>300 且 y<100）出现目标昵称才算切换成功。"""
    for exact in (True,):
        try:
            loc = page.get_by_text(name, exact=exact)
            for i in range(loc.count()):
                try:
                    box = loc.nth(i).bounding_box()
                except Exception:
                    continue
                if box and box.get("x", 0) > 300 and box.get("y", 0) < 100:
                    return True
        except Exception:
            continue
    return False


def _search_and_open(page, name: str) -> bool:
    """搜索兜底：好友不在聊天列表时，用搜索框找到并打开会话。"""
    try:
        box = page.get_by_placeholder("搜索", exact=False).first
        if box.count() == 0:
            return False
        box.click()
        box.fill(name)
        time.sleep(4)
        btn = page.get_by_text("发消息", exact=False).first
        if btn.count():
            btn.click(force=True)
            time.sleep(4)
            return True
        candidate = page.get_by_text(name, exact=True).first
        if candidate.count() == 0:
            return False
        if candidate.count() == 0:
            return False
        candidate.click(force=True)
        time.sleep(3)
        btn = page.get_by_text("发消息", exact=False).first
        if btn.count():
            btn.click(force=True)
            time.sleep(3)
        return True
    except Exception as e:
        logger.info("搜索打开 %s 失败: %s", name, e)
        return False


def _locate_contact(page, name: str) -> bool:
    """尝试点击联系人并校验切换成功，最多重试 5 次。"""
    for attempt in range(5):
        try:
            target = _find_contact(page, name)
            if target.count():
                target.click(force=True, timeout=10000)
                time.sleep(random.uniform(2, 4))
                if _verify_in_conversation(page, name):
                    return True
            else:
                try:
                    page.mouse.move(200, 350)
                    page.mouse.wheel(0, 600)
                except Exception:
                    pass
                time.sleep(1.5)
        except Exception as e:
            logger.info("点击联系人 %s 异常: %s", name, str(e)[:100])
        time.sleep(random.uniform(1, 2))

    if _search_and_open(page, name):
        time.sleep(random.uniform(1, 3))
        return _verify_in_conversation(page, name)
    return False


# ── 消息输入与发送 ────────────────────────────────────────────────────────


def _type_and_send(page, input_box, msg_text: str, before_send) -> bool:
    """Record intent immediately before Enter; never retry an uncertain Enter."""
    input_box.click()
    page.keyboard.press("Control+A")
    page.keyboard.press("Delete")
    page.keyboard.type(msg_text, delay=100)
    if msg_text not in (input_box.inner_text() or ""):
        return False
    before_send()
    page.keyboard.press("Enter")
    return True


def _wait_input_cleared(input_box, msg_text: str, wait: float = 8) -> bool:
    """消息发出后输入框应不再包含发送文字，以此确认真正发出。"""
    deadline = time.time() + wait
    while time.time() < deadline:
        time.sleep(1)
        try:
            cur = input_box.inner_text() or ""
            if msg_text not in cur:
                return True
        except Exception:
            pass
    return False


def send_to_contact(page, name, msg_text, dry_run, before_send):
    duplicates = page.locator(".conversationConversationItemtitle").filter(has_text=re.compile("^" + re.escape(name) + "$"))
    if duplicates.count() > 1:
        return "skipped", "存在同名好友，无法准确确认发送对象"
    if not _locate_contact(page, name):
        return "failed", "未能准确定位该好友会话"
    if detect_rate_limit(page):
        return "blocked", "平台要求验证或提示操作频繁"
    input_box = page.locator('div[contenteditable="true"]').first
    try:
        if not input_box.count() or input_box.bounding_box() is None:
            return "failed", "找不到聊天输入框"
        input_box.wait_for(state="visible", timeout=8000)
    except Exception:
        return "failed", "找不到聊天输入框"
    if dry_run:
        return "succeeded", "模拟检查通过，未发送消息"
    # Exceptions are handled by the executor using the durable delivery status.
    if not _type_and_send(page, input_box, msg_text, before_send):
        return "failed", "文字未进入输入框，未发送消息"
    if _wait_input_cleared(input_box, msg_text):
        if detect_rate_limit(page):
            return "blocked", "发送后平台要求验证，结果需到抖音确认"
        return "succeeded", "页面已确认发送"
    return "unknown", "已尝试发送但未确认结果，请到抖音查看；不会自动重发"


# ── 联系人同步 ────────────────────────────────────────────────────────────

_EXTRACT_JS = """
    () => {
        const out = [];
        const seen = new Set();
        document.querySelectorAll('.conversationConversationItemtitle').forEach(t => {
            const name = (t.textContent || '').trim();
            if (!name || seen.has(name)) return;
            seen.add(name);
            const wrap = t.parentElement;
            const s = wrap ? wrap.querySelector('.commonStreaknormalText') : null;
            out.push({ name: name, streak: s ? (s.textContent || '').trim() : '' });
        });
        return out;
    }
"""


def _open_chat_page(page) -> bool:
    """打开抖音私信页并等待加载，返回是否成功。"""
    for attempt in range(3):
        try:
            page.goto(CHAT_URL, timeout=90000, wait_until="domcontentloaded")
            return True
        except Exception as e:
            logger.info("打开页面失败（第 %s 次）: %s", attempt + 1, str(e)[:80])
            time.sleep(5)
    return False


def _scroll_and_extract(page, collected: list[dict], max_rounds: int = 20) -> None:
    """滚动聊天列表并提取联系人，直到没有新数据。"""
    for _ in range(max_rounds):
        data = page.evaluate(_EXTRACT_JS) or []
        new_items = [x for x in data if x not in collected]
        if new_items:
            collected.extend(new_items)
            stable = 0
        else:
            stable = getattr(_scroll_and_extract, "_stable", 0) + 1
            _scroll_and_extract._stable = stable
            if stable >= 2:
                break
        try:
            page.mouse.move(200, 350)
            page.mouse.wheel(0, 800)
        except Exception:
            pass
        page.wait_for_timeout(1200)


def fetch_chat_contacts() -> dict:
    """从抖音私信页左侧聊天列表读取联系人（含火花天数），供网页端勾选。"""
    result = {"at": _now(), "names": [], "error": None}

    try:
        with open_browser() as (p, browser, context, page):
            if not _open_chat_page(page):
                result["error"] = "无法打开抖音私信页面"
                return result

            page.wait_for_timeout(10000)
            logged, why = check_login(page)
            if not logged:
                result["error"] = why
                return result

            if detect_rate_limit(page):
                result["error"] = "平台要求验证或提示操作频繁"
                return result

            collected: list[dict] = []
            for attempt in range(3):
                try:
                    page.wait_for_selector(".conversationConversationItemtitle", timeout=45000)
                except Exception:
                    logger.info("第 %s 次等待联系人列表超时", attempt + 1)

                _scroll_and_extract._stable = 0
                _scroll_and_extract(page, collected)

                if collected:
                    break
                try:
                    page.reload(wait_until="domcontentloaded", timeout=90000)
                    page.wait_for_timeout(12000)
                except Exception:
                    pass

            result["names"] = collected
            logger.info("已读取聊天列表联系人 %s 个", len(result["names"]))
    except Exception as e:
        logger.error("获取联系人异常: %s", e)
        result["error"] = f"获取联系人异常: {e}"
    return result


