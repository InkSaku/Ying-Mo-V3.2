"""Exercise the real Chromium adapter against an offline chat fixture."""
import pytest

from app.spark.vendor import automation, creator_map


@pytest.fixture()
def chat_page(monkeypatch):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, chromium_sandbox=True)
        page = browser.new_page(viewport={"width": 1366, "height": 800})
        page.set_content("""
            <button style="position:absolute;left:20px;top:120px">小林</button>
            <h2 style="position:absolute;left:400px;top:10px">小林</h2>
            <div contenteditable="true" style="position:absolute;left:400px;top:180px;width:500px;height:90px"></div>
            <script>
              window.fixtureMessages = [];
              document.querySelector('[contenteditable]').addEventListener('keydown', event => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  window.fixtureMessages.push(event.target.textContent);
                  event.target.textContent = '';
                }
              });
            </script>
        """)
        monkeypatch.setattr(automation.time, "sleep", lambda _: None)
        yield page
        browser.close()


def test_real_browser_dry_run_does_not_type_or_press_enter(chat_page):
    result = automation.send_to_contact(chat_page, "小林", "测试问候", True,
                                         lambda: pytest.fail("dry run must not record a send"))
    assert result[0] == "succeeded"
    assert chat_page.evaluate("window.fixtureMessages") == []
    assert chat_page.locator('[contenteditable]').inner_text() == ""


def test_real_browser_records_intent_before_enter_and_sends_once(chat_page):
    intents = []
    def before_send():
        assert chat_page.evaluate("window.fixtureMessages") == []
        intents.append("recorded")
    result = automation.send_to_contact(chat_page, "小林", "测试问候", False, before_send)
    assert result[0] == "succeeded"
    assert intents == ["recorded"]
    assert chat_page.evaluate("window.fixtureMessages") == ["测试问候"]


def test_real_browser_blocks_platform_verification_before_send(chat_page):
    chat_page.locator("body").evaluate("body => body.insertAdjacentHTML('beforeend', '<p>安全验证</p>')")
    result = automation.send_to_contact(chat_page, "小林", "测试问候", False,
                                         lambda: pytest.fail("verification must stop before Enter"))
    assert result[0] == "blocked"
    assert chat_page.evaluate("window.fixtureMessages") == []


def test_creator_response_collection_does_not_keep_signed_urls():
    class Response:
        url = "https://creator.douyin.com/aweme/v1/creator/im/user_detail/?msToken=private"
        status = 200
        def json(self):
            return {"user_list": [{"user": {"ShortId": "id.", "nickname": "好友"}, "user_id": "123"}]}
    mapping, urls = {}, []
    creator_map._on_response_factory(mapping, urls, "aweme/v1/creator/im/user_detail/")(Response())
    assert mapping == {"id.": {"nickname": "好友", "user_id": "123"}}
    assert urls == ["user_detail"]


def test_duplicate_visible_contact_names_never_send(chat_page):
    chat_page.locator("body").evaluate("body => body.insertAdjacentHTML('beforeend', '<span class=conversationConversationItemtitle>小林</span><span class=conversationConversationItemtitle>小林</span>')")
    status, _ = automation.send_to_contact(chat_page, "小林", "测试问候", False,
                                            lambda: pytest.fail("ambiguous recipient must not send"))
    assert status == "skipped"
    assert chat_page.evaluate("window.fixtureMessages") == []
