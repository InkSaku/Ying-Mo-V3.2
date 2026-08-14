import re
import unicodedata
from datetime import datetime, timezone
from urllib.parse import urlparse

USERNAME_RE = re.compile(r"^[a-z0-9_-]{3,32}$")
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def normalize_username(value):
    return value.strip().lower() if isinstance(value, str) else ""


def normalize_email(value):
    return value.strip().lower() if isinstance(value, str) else ""


def normalize_name(value):
    if not isinstance(value, str):
        return ""
    return " ".join(value.strip().split()).casefold()


def slugify(value):
    if not isinstance(value, str):
        return ""
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value.lower()).strip("-")
    return re.sub(r"-+", "-", value)


def parse_iso_datetime(value):
    if value in (None, ""):
        return None
    if not isinstance(value, str):
        raise ValueError("invalid datetime")
    text = value.strip().replace("Z", "+00:00")
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def validate_external_url(value):
    if value in (None, ""):
        return None
    if not isinstance(value, str):
        raise ValueError("invalid URL")
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("invalid URL")
    return value.strip()
