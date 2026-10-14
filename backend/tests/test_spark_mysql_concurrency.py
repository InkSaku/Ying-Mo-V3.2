"""Real row-lock races, enabled only against an explicitly disposable MySQL schema."""
from concurrent.futures import ThreadPoolExecutor
import os
import threading

from cryptography.fernet import Fernet
import pytest

from app import create_app
from app.extensions import db
from app.models import SparkJob, SparkLoginSession
from app.spark.login_browser import identity_profile
from app.spark.login_session import claim_login, run_login
from app.spark.service import get_account
from .conftest import auth, register, token_from
from .test_spark import state_for


@pytest.fixture
def mysql_app():
    url = os.environ.get("SPARK_TEST_MYSQL_URL")
    if not url:
        pytest.skip("Set SPARK_TEST_MYSQL_URL to a disposable yingmo_spark_test_* schema")
    from sqlalchemy.engine import make_url
    parsed = make_url(url)
    assert parsed.host in ("127.0.0.1", "localhost") and parsed.database.startswith("yingmo_spark_test_")
    app = create_app("testing", {"SQLALCHEMY_DATABASE_URI": url,
        "SPARK_CREDENTIAL_KEY": Fernet.generate_key().decode(), "RATELIMIT_ENABLED": False,
        "REGISTRATION_INVITE_CODE": "lyx0811"})
    with app.app_context():
        db.create_all()
    yield app
    with app.app_context():
        db.session.remove()
        db.drop_all()
        db.engine.dispose()


def owner(app):
    with app.test_client() as client:
        response = register(client, "mysqlqrmember")
        token = token_from(response)
        user_id = response.get_json()["data"]["user"]["id"]
    with app.app_context():
        get_account(user_id)
    return user_id, token


def test_mysql_simultaneous_tabs_create_one_session(mysql_app):
    _, token = owner(mysql_app)
    barrier = threading.Barrier(2)
    def start():
        with mysql_app.test_client() as client:
            barrier.wait(timeout=10)
            response = client.post("/api/v1/spark/login-sessions", headers=auth(token), json={})
            assert response.status_code == 202
            return response.get_json()["data"]["id"]
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(start) for _ in range(2)]
        ids = [future.result(timeout=20) for future in futures]
    assert ids[0] == ids[1]
    with mysql_app.app_context():
        assert db.session.scalar(db.select(db.func.count()).select_from(SparkLoginSession)) == 1


def test_mysql_cancel_and_confirm_have_one_atomic_outcome(mysql_app):
    user_id, token = owner(mysql_app)
    with mysql_app.test_client() as client:
        session_id = client.post("/api/v1/spark/login-sessions", headers=auth(token), json={}).get_json()["data"]["id"]
    with mysql_app.app_context():
        claim_login()
        def observer(qr, status, check):
            qr(b"private-qr")
            status("verifying")
            state = state_for(uid="race-user")
            return state, identity_profile(state)
        run_login(session_id, observer)
    barrier = threading.Barrier(2)
    def action(path):
        with mysql_app.test_client() as client:
            barrier.wait(timeout=10)
            return client.post(f"/api/v1/spark/login-sessions/{session_id}/{path}", headers=auth(token), json={}).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        confirming = pool.submit(action, "confirm")
        cancelling = pool.submit(action, "cancel")
        confirm_status = confirming.result(timeout=20)
        assert cancelling.result(timeout=20) == 200
    with mysql_app.app_context():
        account = get_account(user_id)
        session = db.session.get(SparkLoginSession, session_id)
        assert session.candidate_ciphertext is None and session.qr_ciphertext is None
        jobs = db.session.scalar(db.select(db.func.count()).select_from(SparkJob))
        if confirm_status == 200:
            assert session.status == "succeeded" and account.credential_ciphertext and jobs == 1
        else:
            assert confirm_status == 409 and session.status == "cancelled" and not account.credential_ciphertext and jobs == 0
