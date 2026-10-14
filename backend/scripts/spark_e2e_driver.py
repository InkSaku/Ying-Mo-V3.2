"""Offline browser-test platform adapter. Never imported by production worker."""


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
