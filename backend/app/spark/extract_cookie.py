"""在本地电脑（有界面的 Windows/macOS）运行：打开浏览器扫码登录抖音，导出登录态。

用法：
    pip install -r requirements.txt
    playwright install chromium
    python extract_cookie.py

生成 data/state.json 后，到网页端「设置 -> 上传登录态」上传即可。
"""

from __future__ import annotations

import os
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT_PATH = Path(__file__).resolve().parent / "data" / "state.json"


def main() -> None:
    os.umask(0o077)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(OUT_PATH.parent, 0o700)
    print("正在打开浏览器，请在弹出的窗口里用手机抖音 App 扫码登录…")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()
        page.goto("https://www.douyin.com/chat", wait_until="domcontentloaded", timeout=60000)
        print("如扫码后出现额外身份验证，请本人在这个官方浏览器窗口完成；完成前不会保存登录态。")

        deadline = time.monotonic() + 300
        while time.monotonic() < deadline:
            if page.is_closed():
                print("\n浏览器已关闭，登录已取消。")
                browser.close()
                sys.exit(1)
            cookies = context.cookies()
            if any(c["name"].startswith("sessionid") and c["value"] for c in cookies):
                page.wait_for_timeout(2000)
                state = context.storage_state()
                state["cookies"] = [cookie for cookie in state["cookies"] if cookie.get("name")]
                OUT_PATH.write_text(json.dumps(state, ensure_ascii=False), encoding="utf-8")
                os.chmod(OUT_PATH, 0o600)
                print(f"\n登录态已保存到: {OUT_PATH}")
                browser.close()
                return
            page.wait_for_timeout(2000)

        print("\n超时：5 分钟内未完成扫码登录，请重新运行。")
        browser.close()
        sys.exit(1)


if __name__ == "__main__":
    main()

# Derived from diyiqiuye/douyin-keeper, commit 07d9c52e373f5e2c39da91415d7a53e9e1d7294c
# MIT License
# 
# Copyright (c) 2026 Douyin Spark Keeper contributors
# 
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
# 
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
# 
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.
