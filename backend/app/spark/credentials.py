import json

from cryptography.fernet import Fernet, InvalidToken
from flask import current_app


class CredentialError(ValueError):
    pass


def credential_cipher():
    key = current_app.config.get("SPARK_CREDENTIAL_KEY", "")
    if not key:
        raise CredentialError("续火花服务尚未配置凭证加密密钥，请联系站点管理员。")
    try:
        return Fernet(key.encode() if isinstance(key, str) else key)
    except (ValueError, TypeError):
        raise CredentialError("续火花服务的凭证加密配置无效，请联系站点管理员。") from None


def validate_state(raw):
    if len(raw) > 5 * 1024 * 1024:
        raise CredentialError("登录态文件不得超过 5 MB。")
    try:
        state = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        raise CredentialError("请上传 Playwright 导出的 JSON 登录态文件。") from None
    if not isinstance(state, dict) or not isinstance(state.get("cookies"), list) or not state["cookies"]:
        raise CredentialError("登录态缺少 cookies，请重新运行扫码脚本。")
    cookies = []
    for cookie in state["cookies"]:
        if not isinstance(cookie, dict):
            raise CredentialError("登录态中的 Cookie 格式无效。")
        domain = str(cookie.get("domain", "")).lstrip(".").lower()
        if domain != "douyin.com" and not domain.endswith(".douyin.com"):
            continue
        if not all(isinstance(cookie.get(key), str) for key in ("name", "value", "domain", "path")):
            raise CredentialError("登录态中的 Cookie 格式无效。")
        if (not cookie["path"].startswith("/") or not cookie["name"]
            or ("expires" in cookie and (type(cookie["expires"]) not in (int, float)))
            or any(key in cookie and type(cookie[key]) is not bool for key in ("httpOnly", "secure"))
            or ("sameSite" in cookie and cookie["sameSite"] not in ("Strict", "Lax", "None"))):
            raise CredentialError("登录态中的 Cookie 属性格式无效。")
        cookies.append({key: cookie[key] for key in
                        ("name", "value", "domain", "path", "expires", "httpOnly", "secure", "sameSite") if key in cookie})
    if not any(c["name"].startswith("sessionid") and c["value"] for c in cookies):
        raise CredentialError("未找到抖音登录 Cookie，请完成扫码后重新导出。")
    origins = state.get("origins", [])
    if not isinstance(origins, list):
        raise CredentialError("登录态 origins 格式无效。")
    from urllib.parse import urlsplit
    kept = []
    for origin in origins:
        if not isinstance(origin, dict):
            continue
        url = urlsplit(str(origin.get("origin", "")))
        if url.scheme == "https" and (url.hostname == "douyin.com" or (url.hostname or "").endswith(".douyin.com")):
            values = origin.get("localStorage", [])
            if not isinstance(values, list) or any(not isinstance(item, dict)
                or not all(isinstance(item.get(key), str) for key in ("name", "value")) for item in values):
                raise CredentialError("登录态中的浏览器存储格式无效。")
            kept.append({"origin": f"https://{url.hostname}", "localStorage": [{"name": item["name"], "value": item["value"]} for item in values]})
    return {"cookies": cookies, "origins": kept}


def encrypt_state(state):
    return credential_cipher().encrypt(json.dumps(state, ensure_ascii=False).encode()).decode()


def decrypt_state(ciphertext):
    try:
        return json.loads(credential_cipher().decrypt(ciphertext.encode()))
    except (InvalidToken, ValueError, AttributeError):
        raise CredentialError("登录态无法解密，请联系管理员检查密钥或重新导入。") from None
