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
            <div class="conversationConversationItemwrapper conversationConversationItemcurConversation"><button class="conversationConversationItemtitle" style="position:absolute;left:20px;top:120px">小林</button></div>
            <h2 class="RightPanelHeadertitle" style="position:absolute;left:400px;top:10px">小林</h2>
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


@pytest.mark.parametrize("header", ["小林(3)", "小林（3）", "小林 (123)"])
def test_group_member_count_passes_dry_run_only_for_selected_conversation(chat_page, header):
    chat_page.locator('.RightPanelHeadertitle').evaluate("(e, text) => e.textContent = text", header)
    status, _ = automation.send_to_contact(chat_page, "小林", "测试问候", True,
                                         lambda: pytest.fail("dry run must not record a send"))
    assert status == "succeeded"
    assert chat_page.evaluate("window.fixtureMessages") == []
    assert chat_page.locator('[contenteditable]').inner_text() == ""


@pytest.mark.parametrize("header,selected", [("小林(3)", "其他好友"), ("小林二号(3)", "小林"),
                                            ("小林(讨论组)", "小林"), ("小林(3)其他", "小林")])
def test_wrong_or_similarly_named_conversation_is_not_verified(chat_page, header, selected):
    chat_page.locator('.RightPanelHeadertitle').evaluate("(e, text) => e.textContent = text", header)
    chat_page.locator('.conversationConversationItemtitle').evaluate("(e, text) => e.textContent = text", selected)
    assert automation._verify_in_conversation(chat_page, "小林") is False
    assert chat_page.evaluate("window.fixtureMessages") == []


def test_message_preview_at_old_header_coordinates_is_not_conversation_identity(chat_page):
    chat_page.locator('.RightPanelHeadertitle').evaluate("e => e.textContent = '其他好友'")
    chat_page.locator('body').evaluate("e => e.insertAdjacentHTML('beforeend', '<div style=\"position:absolute;left:400px;top:10px\">小林</div>')")
    assert automation._verify_in_conversation(chat_page, "小林") is False


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


def test_login_tab_is_not_misidentified_as_security_challenge(chat_page):
    from app.spark.login_browser import login_challenge
    chat_page.set_content("<button>扫码登录</button><button>验证码登录</button><button>获取验证码</button>")
    assert login_challenge(chat_page) is False
    chat_page.set_content("<p>拖动滑块完成验证</p>")
    assert login_challenge(chat_page) is True


def test_native_shortcut_replaces_existing_draft_before_sending(chat_page):
    box = chat_page.locator('[contenteditable]')
    box.fill("原来未发送的草稿")
    status, _ = automation.send_to_contact(chat_page, "小林", "测试问候", False, lambda: None)
    assert status == "succeeded"
    assert chat_page.evaluate("window.fixtureMessages") == ["测试问候"]


def test_rich_editor_caret_marker_does_not_reject_entered_message(chat_page):
    # Douyin keeps this separate leaf after the actual message on every input.
    box = chat_page.locator('[contenteditable]')
    box.evaluate(r"""element => element.addEventListener('input', () => {
        const text = element.textContent;
        element.replaceChildren();
        const line = document.createElement('div');
        line.className = 'ace-line';
        const content = document.createElement('span');
        content.textContent = text.replace(/\u200b$/, '');
        const marker = document.createElement('span');
        marker.dataset.enter = 'true';
        marker.dataset.leaf = 'true';
        marker.textContent = '\u200b';
        line.append(content, marker);
        element.append(line);
        const selection = window.getSelection();
        selection.selectAllChildren(content);
        selection.collapseToEnd();
    })""")
    intents = []
    def before_send():
        assert box.inner_text().endswith('\u200b')
        assert automation._editor_text(box) == '今天也要开心哦'
        assert chat_page.evaluate('window.fixtureMessages') == []
        intents.append(True)
    assert automation._type_and_send(chat_page, box, '今天也要开心哦', before_send)
    assert intents == [True]
    assert len(chat_page.evaluate('window.fixtureMessages')) == 1


def test_editor_text_preserves_message_characters_and_line_breaks(chat_page):
    box = chat_page.locator('[contenteditable]')
    box.evaluate(r"""element => {
        element.innerHTML = '<div class="ace-line"><span>第一行\u200b</span><span data-enter="true" data-leaf="true">\u200b</span></div>'
            + '<div class="ace-line"><span>👩‍💻 你好</span><span data-enter="true" data-leaf="true">\u200b</span></div>';
    }""")
    assert automation._editor_text(box) == '第一行\u200b\n👩‍💻 你好'
    # Meaningful text in a leaf must not be discarded as an empty marker.
    box.locator('[data-enter]').last.evaluate("e => e.textContent = '额外文字'")
    assert automation._editor_text(box).endswith('额外文字')


def test_mismatched_editor_text_never_records_intent_or_presses_enter(chat_page):
    box = chat_page.locator('[contenteditable]')
    box.evaluate("e => e.addEventListener('input', () => e.textContent = '不匹配的文字')")
    assert not automation._type_and_send(chat_page, box, '今天也要开心哦',
                                        lambda: pytest.fail('mismatched text must not send'))
    assert chat_page.evaluate('window.fixtureMessages') == []


def test_qr_reads_original_image_not_animated_instruction_overlay(chat_page):
    import base64
    from io import BytesIO
    from PIL import Image
    from app.spark.login_browser import qr_locator, qr_bytes
    output = BytesIO()
    Image.new("RGB", (512, 512), "white").save(output, format="PNG")
    original = output.getvalue()
    source = "data:image/png;base64," + base64.b64encode(original).decode()
    chat_page.set_content(f'''<div id="douyin_login_comp_scan_code"><div id="animate_qrcode_container">
      <img alt="" aria-label="二维码" src="{source}" width="180" height="180">
      <div style="position:absolute;inset:0;background:gray">如何扫码 · 接收消息 · 发送消息</div>
      </div></div>''')
    assert qr_bytes(qr_locator(chat_page)) == original
    chat_page.set_content('<div id="animate_qrcode_container">接收消息 · 发送消息</div>')
    assert qr_locator(chat_page) is None


def test_browser_login_drops_nameless_visitor_cookie_without_weakening_import_validation():
    import json
    from app.spark.login_browser import clean_browser_state
    from app.spark.credentials import CredentialError, validate_state
    captured = {"cookies": [{"name": "", "value": "visitor", "domain": ".douyin.com", "path": "/"},
                            {"name": "sessionid", "value": "authenticated", "domain": ".douyin.com", "path": "/"}], "origins": []}
    with pytest.raises(CredentialError):
        validate_state(json.dumps(captured).encode())
    assert [c["name"] for c in clean_browser_state(captured)["cookies"]] == ["sessionid"]


def test_qr_protocol_requires_successful_issue_and_actual_png():
    import base64
    from io import BytesIO
    from PIL import Image
    from app.spark.login_browser import issued_qr_bytes
    output = BytesIO()
    Image.new("RGB", (512, 512), "black").save(output, format="PNG")
    image = output.getvalue()
    raw = base64.b64encode(image).decode()
    assert issued_qr_bytes({"error_code": 0, "qrcode": raw}) == image
    assert issued_qr_bytes({"error_code": 100, "qrcode": raw}) is None
    assert issued_qr_bytes({"error_code": 0, "qrcode": base64.b64encode(b"not-a-png").decode()}) is None


def test_confirmed_qr_requiring_identity_verification_is_not_success_or_waiting():
    from app.spark.login_browser import qr_requires_verification
    assert qr_requires_verification({"data": {"error_code": 2046, "verify_ways": ["sms"]}})
    for payload in ({"data": {"error_code": 0, "status": "confirmed"}},
                    {"data": {"error_code": "2046"}}, {"data": []}, None):
        assert not qr_requires_verification(payload)


def test_real_browser_stops_on_qr_verification_response_before_timeout(chat_page, monkeypatch):
    import json
    from types import SimpleNamespace
    import playwright.sync_api
    from app.spark.login_browser import observe_login, LoginBrowserError
    context = chat_page.context.browser.new_context()
    closed = []
    def route(request):
        if "check_qrconnect" in request.request.url:
            request.fulfill(content_type="application/json", body=json.dumps({
                "data": {"error_code": 2046, "verify_ways": ["sms"]}, "message": "error"}))
        else:
            request.fulfill(content_type="text/html", body='''<script>
                fetch('/passport/web/check_qrconnect/');
                </script><p>身份验证</p>''')
    context.route("https://www.douyin.com/**", route)
    def close():
        closed.append(True)
        context.close()
    browser = SimpleNamespace(new_context=lambda **kwargs: context, close=close)
    class Runtime:
        def __enter__(self):
            return SimpleNamespace(chromium=SimpleNamespace(launch=lambda **kwargs: browser))
        def __exit__(self, *args):
            pass
    monkeypatch.setattr(playwright.sync_api, "sync_playwright", Runtime)
    with pytest.raises(LoginBrowserError) as error:
        observe_login(lambda image: pytest.fail("verification must not publish a new QR"),
                      lambda *args: None, lambda: None, timeout=10)
    assert error.value.status == "blocked"
    assert "额外身份验证" in error.value.reason
    assert closed == [True]
