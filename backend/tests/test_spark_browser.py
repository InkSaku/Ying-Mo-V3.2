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


def mock_login_browser(chat_page, monkeypatch, html, responses):
    import json
    from types import SimpleNamespace
    import playwright.sync_api
    context = chat_page.context.browser.new_context()
    closed = []
    def route(request):
        from urllib.parse import urlsplit
        url = urlsplit(request.request.url)
        key = url.path + ("?" + url.query if url.query else "")
        if key in responses:
            request.fulfill(content_type="application/json", body=json.dumps(responses[key]))
        else:
            request.fulfill(content_type="text/html; charset=utf-8", body=html)
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
    return closed


def test_real_browser_publishes_visible_official_challenge_for_member(chat_page, monkeypatch):
    from app.spark.login_browser import observe_login, LoginBrowserError
    closed = mock_login_browser(chat_page, monkeypatch, '''<script>
        fetch('/passport/web/check_qrconnect/');
        </script><p>请进行安全验证</p>''', {
        '/passport/web/check_qrconnect/': {"data": {"error_code": 2046, "verify_ways": ["sms"]}}})
    previews = []
    with pytest.raises(LoginBrowserError) as error:
        observe_login(lambda image: pytest.fail("verification must not publish a new QR"),
                      lambda status, details=None: previews.append(details) if status == "verification_preview" else None,
                      lambda: None, timeout=2)
    assert error.value.status == "interrupted"
    assert previews and previews[0]["image"].startswith(b"\x89PNG")
    assert closed == [True]


def test_second_step_response_waits_for_delayed_login_cookie(chat_page, monkeypatch):
    from app.spark.login_browser import observe_login
    closed = mock_login_browser(chat_page, monkeypatch, '''<script>
        fetch('/passport/web/check_qrconnect/').then(() => {
            setTimeout(() => { document.cookie = 'sessionid=fixture;path=/;secure'; }, 500);
        });</script>''', {'/passport/web/check_qrconnect/': {
            'data': {'error_code': 2046, 'verify_ways': [{'verify_way': 'push_verify'}], 'url': 'private-ticket-url'}}})
    statuses = []
    state, _ = observe_login(lambda _: pytest.fail('must not invent a new QR'),
                             lambda value, diagnostics=None: statuses.append((value, diagnostics)), lambda: None, timeout=6)
    assert any(cookie['name'] == 'sessionid' for cookie in state['cookies'])
    assert any(value == 'verifying' for value, _ in statuses)
    signals = [diagnostics['scan_signal'] for value, diagnostics in statuses if value == 'diagnostic']
    assert any(signal.get('verification_methods') == ['push_verify'] for signal in signals)
    assert 'private-ticket-url' not in str(statuses)
    assert closed == [True]


def test_second_step_without_cookie_is_unfinished_login_not_assumed_sms(chat_page, monkeypatch):
    from app.spark.login_browser import observe_login, LoginBrowserError
    mock_login_browser(chat_page, monkeypatch, "<script>fetch('/passport/web/check_qrconnect/');</script>",
                       {'/passport/web/check_qrconnect/': {'data': {'error_code': 2046}}})
    with pytest.raises(LoginBrowserError) as error:
        observe_login(lambda _: None, lambda *args: None, lambda: None, timeout=2)
    assert error.value.status == 'interrupted'
    assert '未取得有效登录凭证' in error.value.reason
    assert '短信' not in error.value.reason


def test_verification_method_diagnostics_keep_only_known_enums():
    from app.spark.login_browser import verification_methods, login_handoff_reason
    assert verification_methods({'verify_ways': [
        {'verify_way': 'push_verify', 'mobile': 'private-phone', 'verify_ticket': 'private-ticket'},
        {'verify_way': 'mobile_sms_verify'}, 'sms', 'private-phone', {'verify_way': 2046}, None,
    ]}) == ['mobile_sms_verify', 'push_verify', 'sms']
    from app.spark.login_browser import login_handoff_prompt
    for methods in (['push_verify'], ['mobile_sms_verify', 'face_verify'], ['sms']):
        assert '短信' not in login_handoff_reason({'verification_methods': methods})
        assert '设备确认' not in login_handoff_prompt(methods)
        assert '短信' not in login_handoff_prompt(methods)


def test_late_old_qr_decision_does_not_block_current_qr(chat_page, monkeypatch):
    from app.spark.login_browser import observe_login
    import base64
    from io import BytesIO
    from PIL import Image
    buffer = BytesIO()
    Image.new('RGB', (32, 32), 'white').save(buffer, format='PNG')
    png = base64.b64encode(buffer.getvalue()).decode()
    mock_login_browser(chat_page, monkeypatch, '''<script>(async () => {
        await fetch('/passport/web/get_qrcode/?generation=old');
        await fetch('/passport/web/get_qrcode/?generation=current');
        await fetch('/passport/web/check_qrconnect/?token=old');
        setTimeout(() => { document.cookie = 'sessionid=fixture;path=/;secure'; }, 500);
        })();</script>''', {
        '/passport/web/get_qrcode/?generation=old': {'data': {'error_code': 0, 'token': 'old', 'qrcode': png}},
        '/passport/web/get_qrcode/?generation=current': {'data': {'error_code': 0, 'token': 'current', 'qrcode': png}},
        '/passport/web/check_qrconnect/?token=old': {'data': {'error_code': 2046}},
    })
    signals = []
    state, _ = observe_login(lambda _: None, lambda status, diagnostics=None: signals.append(diagnostics) if diagnostics else None,
                             lambda: None, timeout=6)
    assert any(cookie['name'] == 'sessionid' for cookie in state['cookies'])
    assert not any(signal['scan_signal'].get('data_error_code') == 2046 for signal in signals)


def test_visible_browser_keeps_challenge_open_until_user_completes(chat_page, monkeypatch):
    from app.spark.login_browser import observe_login
    closed = mock_login_browser(chat_page, monkeypatch, """<p>请进行安全验证</p><script>
        fetch('/passport/web/check_qrconnect/');
        setTimeout(() => { document.cookie = 'sessionid=fixture;path=/;secure'; }, 600);
        </script>""", {'/passport/web/check_qrconnect/': {'data': {
            'error_code': 2046, 'verify_ways': ['mobile_sms_verify', 'face_verify']}}})
    statuses = []
    state, _ = observe_login(lambda _: None, lambda status, details=None: statuses.append((status, details)),
                             lambda: None, timeout=6, headless=False)
    assert any(cookie['name'] == 'sessionid' for cookie in state['cookies'])
    assert any(status == 'verifying' and details and details['browser_visible'] for status, details in statuses)
    assert closed == [True]


def test_challenge_in_visible_iframe_is_detected_but_hidden_frame_is_ignored(chat_page):
    from app.spark.login_browser import browser_challenge
    chat_page.set_content('<iframe srcdoc="<p>请进行安全验证</p>"></iframe>')
    chat_page.frame_locator('iframe').get_by_text('请进行安全验证').wait_for()
    assert browser_challenge(chat_page.context)
    chat_page.locator('iframe').evaluate("e => e.style.display = 'none'")
    assert not browser_challenge(chat_page.context)


def test_login_browser_visibility_is_explicit_and_headless_outside_app():
    from flask import Flask
    from app.spark.login_browser import login_browser_headless
    assert login_browser_headless() is True
    app = Flask(__name__)
    with app.app_context():
        assert login_browser_headless() is True
        app.config['SPARK_LOGIN_HEADLESS'] = False
        assert login_browser_headless() is False
        app.config['SPARK_LOGIN_HEADLESS'] = True
        assert login_browser_headless() is True



def test_headless_member_operates_official_screen_and_login_is_returned(chat_page, monkeypatch):
    from app.spark.login_browser import observe_login
    mock_login_browser(chat_page, monkeypatch, """<script>fetch('/passport/web/check_qrconnect/');</script>
        <button style="position:absolute;left:20px;top:20px;width:180px;height:40px"
          onclick="document.cookie='sessionid=fixture;path=/;secure'">继续验证</button>""",
        {'/passport/web/check_qrconnect/': {'data': {'error_code': 2046, 'verify_ways': ['face_verify', 'mobile_sms_verify']}}})
    pending = []
    previews = []
    def status(value, details=None):
        if value == 'verification_preview':
            previews.append(details)
            pending.append({'revision': details['revision'], 'action': {'type': 'click', 'x': 60, 'y': 35}})
    state, _ = observe_login(lambda _: None, status, lambda: pending.pop(0) if pending else None, timeout=8)
    assert any(cookie['name'] == 'sessionid' for cookie in state['cookies'])
    assert len(previews) == 1  # no authenticated screenshot follows the click


def test_numeric_input_is_relayed_to_official_form_but_not_chat_editor(chat_page):
    from app.spark.login_browser import apply_login_interaction
    page = chat_page
    page.route('https://www.douyin.com/**', lambda route: route.fulfill(body='<input id="otp"><div id="chat" contenteditable="true"></div><iframe srcdoc="<input id=otp>"></iframe>', content_type='text/html'))
    page.goto('https://www.douyin.com/chat')
    page.locator('#otp').click()
    apply_login_interaction(page, {'type': 'text', 'text': '123456'})
    assert page.locator('#otp').input_value() == '123456'
    page.frame_locator('iframe').locator('#otp').click()
    page.locator('#chat').click()
    apply_login_interaction(page, {'type': 'text', 'text': '987654'})
    assert page.locator('#chat').inner_text() == ''
