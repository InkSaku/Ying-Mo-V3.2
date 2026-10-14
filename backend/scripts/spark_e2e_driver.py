"""Offline browser-test platform adapter. Never imported by production worker."""


def observe_e2e_login(on_qr, on_status, check):
    from io import BytesIO
    import time
    from PIL import Image, ImageDraw
    from app.spark.login_browser import identity_profile
    image = Image.new("RGB", (180, 180), "white")
    draw = ImageDraw.Draw(image)
    for y in range(21):
        for x in range(21):
            if (x * 7 + y * 11 + x * y) % 3:
                draw.rectangle((6 + x * 8, 6 + y * 8, 12 + x * 8, 12 + y * 8), fill="black")
    output = BytesIO()
    image.save(output, format="PNG")
    on_qr(output.getvalue())
    for _ in range(35):
        check()
        time.sleep(0.1)
    on_status("verifying")
    state = {"cookies": [{"name": "sessionid", "value": "offline-e2e-session", "domain": ".douyin.com", "path": "/"},
                         {"name": "uid_tt", "value": "offline-e2e-member", "domain": ".douyin.com", "path": "/"}], "origins": []}
    return state, identity_profile(state, {"nickname": "扫码验收（模拟）", "unique_id": "offline-account"})


class SparkE2EDriver:
    def __init__(self, config):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def sync(self):
        return "succeeded", [{"name": "小林", "streak": "🔥 12"}, {"name": "阿岚", "streak": "🔥 30"}]

    def harvest(self):
        return "succeeded", {"xiaolin": {"nickname": "小林", "user_id": "demo-lin"}}

    def send(self, contact, message, dry, before_send):
        if not dry:
            before_send()
        return "succeeded", "模拟平台定位通过，未向抖音发送" if dry else "模拟平台已确认发送（浏览器测试）"
