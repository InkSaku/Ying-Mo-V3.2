"""Real platform adapter. No mock mode exists in the production worker."""
from .vendor import automation, creator_channel, creator_map
from .vendor.browser import open_browser


class PlaywrightDriver:
    def __init__(self, config):
        self.config = config
        self.handle = None
        self.mode = None

    def __enter__(self):
        return self

    def __exit__(self, *args):
        if self.handle:
            self.handle.__exit__(*args)

    def sync(self):
        result = automation.fetch_chat_contacts()
        error = result.get("error")
        if error:
            status = "blocked" if "平台要求验证" in error else "expired" if any(x in error for x in ("登录", "sessionid", "二维码")) else "failed"
            return status, []
        return "succeeded", result["names"]

    def harvest(self):
        result = creator_map.collect_short_id_map()
        error = result.get("error")
        if error:
            status = "blocked" if "平台要求验证" in error else "expired" if any(x in error for x in ("登录", "sessionid", "cookie")) else "failed"
            return status, {}
        return "succeeded", result["mapping"]

    def send(self, contact, message, dry_run, before_send):
        if not self.handle:
            self.handle = open_browser()
            _, _, self.context, self.page = self.handle.__enter__()
        if contact.get("has_conversation"):
            if self.mode != "consumer":
                if not automation._open_chat_page(self.page):
                    return "failed", "无法打开抖音私信页面"
                self.page.wait_for_timeout(8000)
                self.mode = "consumer"
            logged, _ = automation.check_login(self.page)
            if not logged:
                return "expired", "抖音登录态已失效，请重新导入"
            return automation.send_to_contact(self.page, contact["display_name"], message, dry_run, before_send)
        self.mode = "creator"
        ok, why = creator_channel._do_send(self.page, self.context,
            contact.get("nickname") or contact["display_name"], message, dry_run,
            self.config["creator_max_scrolls"], before_send)
        if ok:
            return "succeeded", "模拟检查通过，未发送消息" if dry_run else "页面已确认发送"
        if "已尝试" in why:
            return "unknown", "已尝试发送但未确认结果，请到抖音查看；不会自动重发"
        if any(x in why for x in ("登录", "cookie")):
            return "expired", "抖音登录态已失效，请重新导入"
        if any(x in why for x in ("频繁", "验证码", "验证")):
            return "blocked", "平台要求验证或提示操作频繁"
        return "failed", "未能准确定位好友或聊天输入框，未发送消息"
