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
from ..errors import browser_failure, failure

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

    cookies = page.context.cookies(CHAT_URL)
    if not any(c["name"].startswith("sessionid") and c["value"] for c in cookies):
        return False, "未检测到 sessionid Cookie"
    return True, "ok"


# ── 联系人定位 ────────────────────────────────────────────────────────────


def _find_contact(page, name: str):
    """优先按全文精确匹配联系人标题，避免误点其他会话里的消息预览。"""
    return page.locator(".conversationConversationItemtitle").filter(
        has_text=re.compile("^" + re.escape(name) + "$")
    ).first


def _verify_in_conversation(page, name: str) -> bool:
    """校验会话标题；群人数后缀只在目标列表项已选中时接受。"""
    try:
        titles = page.locator(".RightPanelHeadertitle:visible")
        if titles.count() != 1:
            return False
        title = titles.first.inner_text().strip()
        if title == name:
            return True
        # Douyin appends a member count to group headers, e.g. 群名(3).
        # A similarly named, stale group must not validate a different recipient.
        if not re.fullmatch(re.escape(name) + r"\s*[（(]\d+[)）]", title):
            return False
        selected = page.locator(
            ".conversationConversationItemcurConversation .conversationConversationItemtitle:visible"
        )
        return selected.count() == 1 and selected.first.inner_text().strip() == name
    except Exception:
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


def _editor_text(input_box) -> str:
    """Read message text without Douyin's empty end-of-line caret nodes."""
    return input_box.evaluate(r"""element => {
        const lines = element.querySelectorAll('.ace-line');
        if (!lines.length) return element.innerText || '';
        return Array.from(lines, line => {
            const copy = line.cloneNode(true);
            copy.querySelectorAll('[data-enter="true"][data-leaf="true"]').forEach(node => {
                if (/^[\u200b\ufeff]*$/.test(node.textContent || '')) node.remove();
            });
            return copy.textContent || '';
        }).join('\n');
    }""")


def _type_and_send(page, input_box, msg_text: str, before_send) -> bool:
    """Record intent immediately before Enter; never retry an uncertain Enter."""
    input_box.click()
    page.keyboard.press("ControlOrMeta+A")
    page.keyboard.press("Delete")
    page.keyboard.type(msg_text, delay=100)
    if _editor_text(input_box).strip() != msg_text.strip():
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
            cur = _editor_text(input_box)
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

# 会话标题会随好友改名变化；会话 ID 与对方 sec_uid 不变，读取自列表项的 React 属性。
# 页面结构变化导致读不到标识时保持为空，同步退回按名字匹配。
_EXTRACT_JS = """
    () => {
        const identity = el => {
            const key = Object.keys(el).find(k => k.startsWith('__reactFiber'));
            let fiber = key ? el[key] : null;
            let conversation = '', peer = '';
            for (let depth = 0; fiber && depth < 16; depth++, fiber = fiber.return) {
                const props = fiber.memoizedProps;
                if (!props || typeof props !== 'object') continue;
                try {
                    if (!peer && props.conversation && typeof props.conversation === 'object')
                        peer = String(props.conversation.toParticipantSecUserId || '');
                    if (!conversation && props.virtualItem && typeof props.virtualItem === 'object')
                        conversation = String(props.virtualItem.id || '');
                } catch (e) {}
                if (conversation && peer) break;
            }
            return { conversation_id: conversation, peer_id: peer };
        };
        const out = [];
        const seen = new Set();
        document.querySelectorAll('.conversationConversationItemtitle').forEach(t => {
            const name = (t.textContent || '').trim();
            if (!name) return;
            const ids = identity(t);
            const marker = [name, ids.conversation_id, ids.peer_id].join('\\u0000');
            if (seen.has(marker)) return;
            seen.add(marker);
            const wrap = t.parentElement;
            const s = wrap ? wrap.querySelector('.commonStreaknormalText') : null;
            out.push({ name: name, streak: s ? (s.textContent || '').trim() : '', ...ids });
        });
        return out;
    }
"""


def _merge_extracted(collected: list[dict]) -> list[dict]:
    """按名字合并多轮滚动结果；同名不同会话时清空标识，交给发送时的同名保护。"""
    merged: dict[str, dict] = {}
    for item in collected:
        entry = merged.setdefault(item["name"], {"name": item["name"], "streak": "", "conversation_id": "",
                                                 "peer_id": "", "duplicate": False})
        if item.get("streak") and not entry["streak"]:
            entry["streak"] = item["streak"]
        for field in ("conversation_id", "peer_id"):
            value = item.get(field) or ""
            if value and entry[field] and entry[field] != value:
                entry["duplicate"] = True
            elif value:
                entry[field] = value
    for entry in merged.values():
        if entry["duplicate"]:
            entry["conversation_id"] = entry["peer_id"] = ""
    return list(merged.values())


def _open_chat_page(page, *, raise_on_failure=False) -> bool:
    """打开抖音私信页并等待加载，返回是否成功。"""
    last_error = None
    for attempt in range(3):
        try:
            page.goto(CHAT_URL, timeout=90000, wait_until="domcontentloaded")
            return True
        except Exception as e:
            last_error = e
            logger.info("打开页面失败（第 %s 次）: %s", attempt + 1, type(e).__name__)
            if attempt < 2:
                time.sleep(5)
    if raise_on_failure and last_error is not None:
        raise last_error
    return False


def _scroll_and_extract(page, collected: list[dict], max_rounds: int = 20) -> None:
    """滚动聊天列表并提取联系人，直到没有新数据。"""
    stable = 0
    for _ in range(max_rounds):
        data = page.evaluate(_EXTRACT_JS) or []
        new_items = [x for x in data if x not in collected]
        if new_items:
            collected.extend(new_items)
            stable = 0
        else:
            stable += 1
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
    stage = "browser"
    try:
        with open_browser() as (p, browser, context, page):
            stage = "page"
            if not _open_chat_page(page, raise_on_failure=True):
                result.update(failure("CHAT_PAGE_UNAVAILABLE"))
                return result

            page.wait_for_timeout(10000)
            stage = "contacts"
            collected: list[dict] = []
            for attempt in range(3):
                error = _contact_page_failure(page)
                if error:
                    result.update(error)
                    return result
                try:
                    page.wait_for_selector(".conversationConversationItemtitle", timeout=45000)
                except Exception:
                    logger.info("第 %s 次等待联系人列表超时", attempt + 1)

                # A delayed login redirect or challenge can appear while waiting
                # for the list, including after a freshly confirmed QR login.
                error = _contact_page_failure(page)
                if error:
                    result.update(error)
                    return result
                _scroll_and_extract(page, collected)

                if collected:
                    break
                try:
                    if attempt == 2:
                        break
                    page.reload(wait_until="domcontentloaded", timeout=90000)
                    page.wait_for_timeout(12000)
                except Exception as error:
                    result.update(browser_failure(error, "page"))
                    return result

            if not collected:
                result.update(failure("CONTACTS_NOT_READY"))
                return result
            result["names"] = _merge_extracted(collected)
            logger.info("已读取聊天列表联系人 %s 个", len(result["names"]))
    except Exception as e:
        result.update(browser_failure(e, stage))
        logger.error("获取联系人失败: %s", result["error_code"])
    return result


def _contact_page_failure(page):
    logged, _ = check_login(page)
    if not logged:
        return failure("LOGIN_EXPIRED")
    restriction = detect_rate_limit(page)
    if restriction:
        return failure("PLATFORM_NETWORK_ERROR" if restriction == "网络异常" else "PLATFORM_VERIFICATION")
    return None


