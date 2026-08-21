import logging
import os
import re
import uuid
from time import perf_counter

from dotenv import load_dotenv
from flask import Flask, abort, g, make_response, request
from werkzeug.middleware.proxy_fix import ProxyFix

from app.config import get_config
from app.extensions import db, init_extensions, jwt


def create_app(config_name=None, config_overrides=None):
    load_dotenv()
    environment = config_name or os.getenv("APP_ENV", "development")
    config_class = get_config(environment)

    app = Flask(__name__)
    app.config.from_object(config_class)
    app.config["SQLALCHEMY_DATABASE_URI"] = config_class.database_uri()
    if config_overrides:
        app.config.update(config_overrides)
    if environment == "production":
        config_class.validate(app)
    proxy_count = app.config.get("TRUST_PROXY_COUNT", 0)
    if proxy_count:
        app.wsgi_app = ProxyFix(
            app.wsgi_app, x_for=proxy_count, x_proto=proxy_count, x_host=proxy_count
        )

    _configure_logging(app)
    _register_request_hooks(app)
    init_extensions(app)
    from app.storage import init_storage
    init_storage(app)
    from app.mail import init_mailer
    init_mailer(app)

    from app import models  # noqa: F401
    from app.blueprints import register_blueprints
    from app.commands import register_commands
    register_blueprints(app)
    register_commands(app)
    _register_jwt_handlers()
    _register_error_handlers(app)

    @app.get("/api/v1/health")
    def health():
        from app.common.responses import success_response
        return success_response({"service": "yingmo-backend", "status": "ok"})

    _register_document_routes(app)

    return app


def _shell(indexable=False):
    robots = "index,follow" if indexable else "noindex,nofollow"
    html = f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="{robots}">
  <meta name="description" content="Ying-Mo 是一个邀请制的朋友记录空间。">
  <meta property="og:title" content="Ying-Mo">
  <meta property="og:description" content="写字，也和朋友一起记录生活。">
  <link rel="icon" type="image/png" sizes="256x256" href="/favicon.png">
  <link rel="shortcut icon" href="/favicon.ico">
  <link rel="apple-touch-icon" href="/favicon.png">
  <title>Ying-Mo</title>
</head>
<body><div id="root" aria-busy="true"></div></body>
</html>"""
    response = make_response(html)
    response.headers["Content-Type"] = "text/html; charset=utf-8"
    response.headers["Cache-Control"] = "private, no-store"
    return response


def _register_document_routes(app):
    @app.get("/")
    def landing_page():
        return _shell(indexable=True)

    @app.get("/about")
    def about_page():
        return _shell(indexable=True)

    def protected_shell(**_kwargs):
        return _shell(indexable=False)

    protected_rules = (
        "/articles", "/articles/<path:rest>", "/notes", "/notes/<path:rest>",
        "/collections", "/collections/<path:rest>", "/users/<path:rest>",
        "/archive", "/archive/<path:rest>", "/categories", "/categories/<path:rest>",
        "/tags", "/tags/<path:rest>", "/search", "/write", "/write/<path:rest>",
        "/me", "/me/<path:rest>", "/admin", "/admin/<path:rest>",
        "/login", "/register", "/forgot-password", "/verify-email",
        "/verify-email/<path:rest>", "/reset-password", "/reset-password/<path:rest>",
    )
    for index, rule in enumerate(protected_rules):
        app.add_url_rule(rule, f"spa_shell_{index}", protected_shell, methods=["GET"])

    @app.get("/sitemap.xml")
    def sitemap():
        site_url = app.config["SITE_URL"]
        xml = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
            f"<url><loc>{site_url}/</loc></url>"
            f"<url><loc>{site_url}/about</loc></url>"
            "</urlset>"
        )
        response = make_response(xml)
        response.headers["Content-Type"] = "application/xml; charset=utf-8"
        return response

    @app.get("/robots.txt")
    def robots():
        body = "User-agent: *\nDisallow: /articles\nDisallow: /notes\nDisallow: /collections\nDisallow: /users\nDisallow: /archive\nDisallow: /categories\nDisallow: /tags\nDisallow: /search\nDisallow: /me\nDisallow: /admin\n"
        response = make_response(body)
        response.headers["Content-Type"] = "text/plain; charset=utf-8"
        return response

    @app.get("/rss.xml")
    def rss_disabled():
        abort(404)


def _configure_logging(app):
    if not app.logger.handlers:
        app.logger.addHandler(logging.StreamHandler())
    app.logger.setLevel(logging.DEBUG if app.config.get("DEBUG") else logging.INFO)


def _register_request_hooks(app):
    safe_request_id = re.compile(
        r"^(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-"
        r"[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|[0-9A-HJKMNP-TV-Z]{26})$"
    )

    @app.before_request
    def assign_request_id():
        provided = request.headers.get("X-Request-ID", "")
        g.request_id = provided if safe_request_id.fullmatch(provided) else str(uuid.uuid4())
        g.request_started_at = perf_counter()

    @app.after_request
    def security_headers(response):
        response.headers["X-Request-ID"] = g.request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Content-Security-Policy"] = "default-src 'self'; img-src 'self' blob:; media-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "private, no-store"
            response.headers["Pragma"] = "no-cache"
        duration = round((perf_counter() - g.request_started_at) * 1000, 2)
        app.logger.info("%s %s %s %.2fms", request.method, request.path, response.status_code, duration)
        return response


def _register_jwt_handlers():
    from datetime import datetime, timezone
    from app.common.responses import error_response
    from app.models import RefreshSession

    @jwt.token_in_blocklist_loader
    def token_revoked(_header, payload):
        token_type = payload.get("type")
        session_jti = payload.get("jti") if token_type == "refresh" else payload.get("sid")
        if not session_jti:
            return False
        session = db.session.scalar(db.select(RefreshSession).where(RefreshSession.jti == session_jti))
        if session is None or session.revoked_at is not None:
            return True
        expires_at = session.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        return expires_at <= datetime.now(timezone.utc)

    @jwt.unauthorized_loader
    def missing_token(_reason):
        return error_response("AUTHENTICATION_REQUIRED", "需要登录后访问。", 401)

    @jwt.invalid_token_loader
    def invalid_token(_reason):
        return error_response("INVALID_TOKEN", "登录凭证无效。", 401)

    @jwt.expired_token_loader
    def expired_token(_header, _payload):
        return error_response("TOKEN_EXPIRED", "登录凭证已过期。", 401)

    @jwt.revoked_token_loader
    def revoked_token(_header, _payload):
        return error_response("TOKEN_REVOKED", "登录会话已失效。", 401)


def _register_error_handlers(app):
    from app.common.responses import error_response
    from sqlalchemy.orm.exc import StaleDataError

    @app.errorhandler(404)
    def not_found(_error):
        return error_response("RESOURCE_NOT_FOUND", "请求的资源不存在。", 404)

    @app.errorhandler(405)
    def method_not_allowed(_error):
        return error_response("METHOD_NOT_ALLOWED", "请求方法不支持。", 405)

    @app.errorhandler(413)
    def too_large(_error):
        return error_response("PAYLOAD_TOO_LARGE", "上传内容过大。", 413)

    @app.errorhandler(StaleDataError)
    def concurrent_modification(_error):
        db.session.rollback()
        return error_response(
            "CONCURRENT_MODIFICATION",
            "资源已被其他操作更新，请刷新后重试。",
            409,
        )

    @app.errorhandler(Exception)
    def unexpected(error):
        if app.config.get("TESTING"):
            raise error
        app.logger.exception("Unhandled error")
        db.session.rollback()
        return error_response("INTERNAL_ERROR", "服务器内部错误。", 500)
