import pytest

from app import create_app
from app.extensions import db


@pytest.fixture()
def app(tmp_path):
    app = create_app(
        "testing",
        {
            "SQLALCHEMY_DATABASE_URI": "sqlite+pysqlite:///:memory:",
            "REGISTRATION_INVITE_CODE": "lyx0811",
            "UPLOAD_ROOT": tmp_path / "uploads",
            "RATELIMIT_ENABLED": False,
            "SITE_URL": "https://trusted.yingmo.test",
        },
    )
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


def register(client, username, nickname=None, email=None, invite_code="lyx0811"):
    response = client.post(
        "/api/v1/auth/register",
        json={
            "username": username,
            "nickname": nickname or username,
            "email": email or f"{username}@example.com",
            "password": "password123",
            "invite_code": invite_code,
        },
    )
    return response


def token_from(response):
    return response.get_json()["data"]["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}
