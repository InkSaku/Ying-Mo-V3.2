"""Tenant-scoped in-memory credentials; derived from douyin-keeper browser.py."""
from contextlib import contextmanager

from app.spark.context import execution_state


@contextmanager
def open_browser(state_path=None, **ctx_kwargs):
    if state_path is not None:
        raise ValueError("External login-state paths are not supported")
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, chromium_sandbox=True, args=["--disable-dev-shm-usage", "--disable-gpu"])
        try:
            options = {"viewport": {"width": 1366, "height": 800}, **ctx_kwargs}
            context = browser.new_context(storage_state=execution_state(), **options)
            page = context.new_page()
            yield p, browser, context, page
        finally:
            browser.close()
