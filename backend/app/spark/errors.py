"""Public failure reasons; never persist browser exceptions, URLs or credentials."""

FAILURES = {
    "LOGIN_EXPIRED": ("expired", "抖音私信页仍要求登录，已保存的登录信息未生效或已过期。"),
    "PLATFORM_VERIFICATION": ("blocked", "抖音要求安全验证或提示操作频繁。"),
    "PLATFORM_NETWORK_ERROR": ("failed", "续火花后台未能连接抖音，或抖音页面提示网络异常。"),
    "CHAT_PAGE_UNAVAILABLE": ("failed", "多次尝试后仍无法打开抖音私信页面。"),
    "PAGE_TIMEOUT": ("failed", "等待抖音页面加载超时。"),
    "CONTACTS_NOT_READY": ("failed", "没有读取到抖音私信联系人，联系人列表可能尚未加载完成。"),
    "BROWSER_START_FAILED": ("failed", "续火花后台未能启动工作浏览器。"),
    "BROWSER_INTERRUPTED": ("failed", "续火花的工作浏览器意外关闭，本次操作已中断。"),
    "SYNC_FAILED": ("failed", "读取抖音私信联系人时发生异常。"),
    "HARVEST_FAILED": ("failed", "读取抖音号资料时发生异常。"),
    "RESULT_SAVE_FAILED": ("failed", "操作结果未能保存，请联系网站管理员。"),
    "EXECUTION_FAILED": ("failed", "续火花后台执行异常，本次操作未完成。"),
}


def failure(code):
    code = code if code in FAILURES else "EXECUTION_FAILED"
    status, message = FAILURES[code]
    return {"status": status, "error_code": code, "error": message}


def browser_failure(error, stage):
    from playwright.sync_api import TimeoutError

    # Inspect only known markers. The original exception may contain signed URLs
    # or storage state and must never reach a job record or application log.
    detail = str(error)
    if stage == "browser":
        code = "BROWSER_START_FAILED"
    elif "net::ERR_" in detail:
        code = "PLATFORM_NETWORK_ERROR"
    elif "TargetClosedError" == type(error).__name__ or "has been closed" in detail:
        code = "BROWSER_INTERRUPTED"
    elif isinstance(error, TimeoutError):
        code = "PAGE_TIMEOUT"
    elif stage == "page":
        code = "CHAT_PAGE_UNAVAILABLE"
    else:
        code = "SYNC_FAILED" if stage == "contacts" else "EXECUTION_FAILED"
    return {**failure(code), "diagnostic": {"stage": stage, "exception_type": type(error).__name__}}
