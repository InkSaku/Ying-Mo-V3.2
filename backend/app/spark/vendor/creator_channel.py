"""通道 B：creator 页首条消息发送（默认禁用，高风险）。

适用场景：对无会话好友发首条消息（想建立火花但还没聊过）。
方案约束：
- 默认禁用：需 config.allow_first_message = true（UI 显式勾选）；
- 单日 ≤1 条、每次运行 ≤1 人（在 run_send 层强制）；
- 按昵称滚动匹配命中后点击，绝不盲发；
- 命中限流关键词立即停止本轮，不重试。
"""

from __future__ import annotations

import logging
import time

from .config import load_config
from .guard import detect_rate_limit

logger = logging.getLogger("douyin-spark")

CREATOR_CHAT_URL = "https://creator.douyin.com/creator-micro/data/following/chat"

FRIENDS_TAB_CANDIDATES = [
    'xpath=//*[@id="sub-app"]/div/div/div[1]/div[2]',
    'xpath=//*[contains(text(),"好友")]',
]

FRIEND_ITEM_SELECTOR = 'xpath=//div[contains(@class, "semi-list-item-body")]'
NAME_SPAN_SELECTOR = 'xpath=.//span[contains(@class, "item-header-name-")]'
CHAT_INPUT_SELECTOR = "xpath=//div[contains(@class, 'chat-input-')]"

SCROLL_JS = """
() => {
    const els = document.querySelectorAll('[class*="semi-list"], #sub-app ul');
    let el = null;
    for (const e of els) { if (e.scrollHeight > e.clientHeight + 10) { el = e; break; } }
    if (!el) {
        const all = [...document.querySelectorAll('div')].filter(
            x => x.scrollHeight > x.clientHeight + 100 && x.clientHeight > 100
        );
        if (all.length) el = all[0];
    }
    if (el && el.scrollTop + el.clientHeight < el.scrollHeight - 10) {
        el.scrollTop += 600;
        return true;
    }
    return false;
}
"""


def _do_send(page, context, nickname: str, msg_text: str, dry_run: bool, max_scrolls: int, before_send) -> tuple[bool, str]:
    """实际发送逻辑：打开页面 → 定位好友 → 输入消息 → 发送。"""
    page.goto(CREATOR_CHAT_URL, wait_until="domcontentloaded", timeout=90000)
    page.wait_for_timeout(10000)

    if "passport" in page.url.lower() or "login" in page.url.lower():
        return False, f"creator 页跳转到登录页（{page.url}）"
    if not any(c["name"].startswith("sessionid") for c in context.cookies()):
        return False, "creator 页未检测到 sessionid cookie，登录态可能已过期"

    # 点击「好友」tab
    for sel in FRIENDS_TAB_CANDIDATES:
        try:
            loc = page.locator(sel)
            if loc.count() and loc.first.is_visible():
                loc.first.click(timeout=3000)
                break
        except Exception:
            continue
    page.wait_for_timeout(3000)

    # 滚动列表，按昵称匹配并点击
    found = False
    stagnant = 0
    last_names: set[str] = set()
    for _ in range(max_scrolls):
        if detect_rate_limit(page):
            return False, "检测到「操作频繁/验证码」提示，通道 B 停止本轮"

        items = page.locator(FRIEND_ITEM_SELECTOR).all()
        names_now: set[str] = set()
        matches = [it for it in items if it.locator(NAME_SPAN_SELECTOR).count()
                   and it.locator(NAME_SPAN_SELECTOR).inner_text().strip() == nickname]
        if len(matches) > 1:
            return False, "存在同名好友，无法准确确认发送对象"
        for it in items:
            try:
                span = it.locator(NAME_SPAN_SELECTOR)
                if span.count() == 0:
                    continue
                name = span.inner_text().strip()
                names_now.add(name)
                if name == nickname:
                    it.click(timeout=5000)
                    found = True
                    break
            except Exception:
                continue
        if found:
            break

        grew = len(names_now) > len(last_names)
        last_names = names_now
        try:
            moved = bool(page.evaluate(SCROLL_JS))
        except Exception:
            moved = False
        page.wait_for_timeout(500)
        if not moved and not grew:
            stagnant += 1
            if stagnant >= 6:
                break
        else:
            stagnant = 0

    if not found:
        return False, f"好友列表未找到「{nickname}」（无会话好友可能不在列表中）"

    try:
        page.wait_for_selector(CHAT_INPUT_SELECTOR, timeout=15000)
    except Exception:
        return False, "未找到聊天输入框"

    if detect_rate_limit(page):
        return False, "发送前检测到「操作频繁/验证码」提示"

    input_box = page.locator(CHAT_INPUT_SELECTOR).first
    input_bounds = input_box.bounding_box()
    # Confirm the conversation header changed, rather than trusting the list click.
    header_confirmed = False
    for title in page.get_by_text(nickname, exact=True).all():
        box = title.bounding_box()
        if box and input_bounds and box["x"] >= input_bounds["x"] and box["y"] < min(300, input_bounds["y"]):
            header_confirmed = True
            break
    if not header_confirmed:
        return False, "未能确认当前会话属于该好友"
    if dry_run:
        return True, "dry-run（通道 B 定位成功）"
    from .automation import _type_and_send, _wait_input_cleared
    if not _type_and_send(page, input_box, msg_text, before_send):
        return False, "文字未进入输入框，未发送消息"
    if _wait_input_cleared(input_box, msg_text):
        if detect_rate_limit(page):
            return False, "发送后平台要求验证，结果需要确认"
        return True, "ok"
    return False, "已尝试发送但未确认结果"
