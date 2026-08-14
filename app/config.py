import os
import secrets
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlsplit

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def _origins():
    value = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    return tuple(x.strip() for x in value.split(",") if x.strip())


def _db_url(name, default):
    return os.getenv(name, default).strip()


class BaseConfig:
    APP_ENV = "development"
    DEBUG = False
    TESTING = False
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}

    SECRET_KEY = os.getenv("SECRET_KEY") or secrets.token_urlsafe(32)
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY") or secrets.token_urlsafe(32)
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES_MINUTES", "15")))
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=int(os.getenv("JWT_REFRESH_TOKEN_EXPIRES_DAYS", "30")))
    JWT_TOKEN_LOCATION = ["headers", "cookies"]
    JWT_REFRESH_COOKIE_NAME = "yingmo_refresh_token"
    JWT_REFRESH_COOKIE_PATH = "/api/v1/auth"
    JWT_COOKIE_SAMESITE = "Lax"
    JWT_COOKIE_SECURE = False
    JWT_COOKIE_CSRF_PROTECT = True

    CORS_ORIGINS = _origins()
    RATELIMIT_STORAGE_URI = os.getenv("RATELIMIT_STORAGE_URI", "memory://")
    RATELIMIT_HEADERS_ENABLED = True
    RATELIMIT_DEFAULT = os.getenv("RATE_LIMIT_API", "300 per minute")
    RATE_LIMIT_REGISTER = os.getenv("RATE_LIMIT_REGISTER", "5 per hour")
    RATE_LIMIT_LOGIN = os.getenv("RATE_LIMIT_LOGIN", "10 per minute")
    RATE_LIMIT_REFRESH = os.getenv("RATE_LIMIT_REFRESH", "30 per minute")
    RATE_LIMIT_COMMENT = os.getenv("RATE_LIMIT_COMMENT", "30 per minute")
    RATE_LIMIT_UPLOAD = os.getenv("RATE_LIMIT_UPLOAD", "20 per hour")

    REGISTRATION_INVITE_CODE = os.getenv("REGISTRATION_INVITE_CODE", "").strip()
    UPLOAD_ROOT = Path(os.getenv("UPLOAD_ROOT", BASE_DIR / "uploads")).expanduser()
    MEDIA_STORAGE_BACKEND = os.getenv("MEDIA_STORAGE_BACKEND", "local").strip().lower()
    S3_BUCKET = os.getenv("S3_BUCKET", "").strip()
    S3_PREFIX = os.getenv("S3_PREFIX", "yingmo-media").strip()
    S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL", "").strip()
    S3_REGION = os.getenv("S3_REGION", "").strip()
    S3_ACCESS_KEY_ID = os.getenv("S3_ACCESS_KEY_ID", "").strip()
    S3_SECRET_ACCESS_KEY = os.getenv("S3_SECRET_ACCESS_KEY", "").strip()
    IMAGE_MAX_BYTES = int(os.getenv("IMAGE_MAX_BYTES", str(15 * 1024 * 1024)))
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH", str(32 * 1024 * 1024)))
    SITE_URL = os.getenv("SITE_URL", "http://localhost:5173").rstrip("/")
    TRUST_PROXY_COUNT = int(os.getenv("TRUST_PROXY_COUNT", "0"))

    @classmethod
    def database_uri(cls):
        return _db_url("DATABASE_URL", "sqlite+pysqlite:///yingmo_dev.db")


class DevelopmentConfig(BaseConfig):
    APP_ENV = "development"
    DEBUG = True


class TestingConfig(BaseConfig):
    APP_ENV = "testing"
    TESTING = True
    JWT_COOKIE_CSRF_PROTECT = False
    SQLALCHEMY_ENGINE_OPTIONS = {}

    @classmethod
    def database_uri(cls):
        return _db_url("TEST_DATABASE_URL", "sqlite+pysqlite:///:memory:")


class ProductionConfig(BaseConfig):
    APP_ENV = "production"
    JWT_COOKIE_SECURE = True
    SECRET_KEY = os.getenv("SECRET_KEY")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
    REGISTRATION_INVITE_CODE = os.getenv("REGISTRATION_INVITE_CODE", "").strip()

    @classmethod
    def database_uri(cls):
        url = _db_url("DATABASE_URL", "")
        if not url.startswith("mysql+pymysql://"):
            raise RuntimeError("Production DATABASE_URL must use mysql+pymysql://")
        if "charset=utf8mb4" not in url.lower():
            raise RuntimeError("Production DATABASE_URL must include charset=utf8mb4")
        return url

    @classmethod
    def validate(cls, app):
        problems = []
        for key in ("SECRET_KEY", "JWT_SECRET_KEY"):
            value = app.config.get(key)
            if not isinstance(value, str) or len(value.encode("utf-8")) < 32:
                problems.append(f"{key} must be at least 32 bytes")
        if not str(app.config.get("REGISTRATION_INVITE_CODE", "")).strip():
            problems.append("REGISTRATION_INVITE_CODE is required")
        if app.config.get("SECRET_KEY") == app.config.get("JWT_SECRET_KEY"):
            problems.append("SECRET_KEY and JWT_SECRET_KEY must differ")
        origins = app.config.get("CORS_ORIGINS", ())
        if not origins or "*" in origins:
            problems.append("CORS_ORIGINS must be explicit in production")
        if str(app.config.get("RATELIMIT_STORAGE_URI", "")).startswith("memory://"):
            problems.append("RATELIMIT_STORAGE_URI must use shared storage in production")
        if app.config.get("MEDIA_STORAGE_BACKEND") != "s3":
            problems.append("MEDIA_STORAGE_BACKEND must be s3 in production")
        elif not app.config.get("S3_BUCKET"):
            problems.append("S3_BUCKET is required when MEDIA_STORAGE_BACKEND=s3")
        if problems:
            raise RuntimeError("Invalid production configuration: " + "; ".join(problems))


CONFIGS = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
}


def get_config(name):
    try:
        return CONFIGS[name]
    except KeyError as exc:
        raise ValueError(f"Unsupported APP_ENV: {name}") from exc
