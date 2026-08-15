import os
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import create_app
from app.extensions import db
from app.models import Post


def test_alembic_upgrade_from_empty_matches_models(tmp_path):
    root=Path(__file__).resolve().parents[1]
    database=tmp_path/"migration.db"
    url=f"sqlite+pysqlite:///{database}"
    env={**os.environ,"DATABASE_URL":url,"REGISTRATION_INVITE_CODE":"lyx0811"}
    result=subprocess.run(
        [sys.executable,"-m","flask","--app","run.py","db","upgrade"],
        cwd=root,env=env,text=True,capture_output=True,check=False,
    )
    assert result.returncode==0,result.stdout+result.stderr
    inspector=inspect(create_engine(url))
    actual_tables=set(inspector.get_table_names())-{"alembic_version"}
    app=create_app("testing")
    with app.app_context():
        expected_tables=set(db.metadata.tables)
        expected_columns={name:set(table.columns.keys()) for name,table in db.metadata.tables.items()}
    assert actual_tables==expected_tables
    for table in expected_tables:
        assert {column["name"] for column in inspector.get_columns(table)}==expected_columns[table]


def test_public_visibility_is_converted_and_downgrade_never_reopens_content(tmp_path):
    root=Path(__file__).resolve().parents[1]
    database=tmp_path/"legacy-visibility.db"; url=f"sqlite+pysqlite:///{database}"
    env={**os.environ,"DATABASE_URL":url,"REGISTRATION_INVITE_CODE":"lyx0811"}
    def flask_db(*args):
        result=subprocess.run([sys.executable,"-m","flask","--app","run.py","db",*args],cwd=root,env=env,text=True,capture_output=True)
        assert result.returncode==0,result.stdout+result.stderr
        return result
    flask_db("upgrade","20260814_0001")
    engine=create_engine(url)
    with engine.begin() as connection:
        connection.execute(text("""
            INSERT INTO users
              (id,username,username_normalized,email,email_normalized,password_hash,nickname,role,status,created_at,updated_at)
            VALUES
              (1,'alice','alice','a@example.com','a@example.com','hash','Alice','user','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        """))
        connection.execute(text("""
            INSERT INTO posts
              (id,author_id,post_type,content_format,status,visibility,moderation_status,created_at,updated_at)
            VALUES
              (1,1,'note','markdown','published','public','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        """))
    result=flask_db("upgrade")
    assert "converting 1 public post" in result.stdout
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT visibility FROM posts WHERE id=1"))=="login_only"
    flask_db("downgrade","20260814_0001")
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT visibility FROM posts WHERE id=1"))=="login_only"


def test_post_edit_version_migration_round_trip_preserves_existing_post(tmp_path):
    root = Path(__file__).resolve().parents[1]
    database = tmp_path / "post-edit-version.db"
    url = f"sqlite+pysqlite:///{database}"
    env = {**os.environ, "DATABASE_URL": url, "REGISTRATION_INVITE_CODE": "lyx0811"}

    def flask_db(*args):
        result = subprocess.run(
            [sys.executable, "-m", "flask", "--app", "run.py", "db", *args],
            cwd=root,
            env=env,
            text=True,
            capture_output=True,
        )
        assert result.returncode == 0, result.stdout + result.stderr

    flask_db("upgrade", "20260814_0002")
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(text("""
            INSERT INTO users
              (id,username,username_normalized,email,email_normalized,password_hash,nickname,role,status,created_at,updated_at)
            VALUES
              (1,'legacy','legacy','legacy@example.com','legacy@example.com','hash','Legacy','user','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        """))
        connection.execute(text("""
            INSERT INTO posts
              (id,author_id,post_type,title,body,content_format,status,visibility,moderation_status,created_at,updated_at)
            VALUES
              (1,1,'article','Legacy Post','before migration','markdown','draft','private','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        """))

    flask_db("upgrade", "20260815_0003")
    inspector = inspect(engine)
    columns = {column["name"]: column for column in inspector.get_columns("posts")}
    assert columns["edit_version"]["nullable"] is False
    assert columns["edit_version"]["default"] in {"1", "'1'"}
    assert any(
        constraint["name"] == "ck_posts_edit_version"
        for constraint in inspector.get_check_constraints("posts")
    )
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT edit_version FROM posts WHERE id=1")) == 1

    with pytest.raises(IntegrityError):
        with engine.begin() as connection:
            connection.execute(text("UPDATE posts SET edit_version=0 WHERE id=1"))

    with Session(engine) as session:
        post = session.get(Post, 1)
        post.body = "versioned update"
        session.commit()
        assert post.edit_version == 2

    flask_db("downgrade", "20260814_0002")
    assert "edit_version" not in {
        column["name"] for column in inspect(engine).get_columns("posts")
    }
    with engine.connect() as connection:
        preserved = connection.execute(text(
            "SELECT title, body, status, visibility FROM posts WHERE id=1"
        )).one()
    assert tuple(preserved) == ("Legacy Post", "versioned update", "draft", "private")

    flask_db("upgrade", "20260815_0003")
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT edit_version FROM posts WHERE id=1")) == 1

    # Keep the release chain covered: 0003 must remain a valid parent for 0004.
    flask_db("upgrade")
    inspector = inspect(engine)
    assert "account_tokens" in inspector.get_table_names()
    assert "edit_version" in {
        column["name"] for column in inspector.get_columns("posts")
    }


def test_account_recovery_migration_preserves_existing_users_and_downgrades_cleanly(tmp_path):
    root = Path(__file__).resolve().parents[1]
    database = tmp_path / "account-recovery.db"
    url = f"sqlite+pysqlite:///{database}"
    env = {**os.environ, "DATABASE_URL": url, "REGISTRATION_INVITE_CODE": "lyx0811"}

    def flask_db(*args):
        result = subprocess.run(
            [sys.executable, "-m", "flask", "--app", "run.py", "db", *args],
            cwd=root,
            env=env,
            text=True,
            capture_output=True,
        )
        assert result.returncode == 0, result.stdout + result.stderr

    flask_db("upgrade", "20260815_0003")
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(text("""
            INSERT INTO users
              (id,username,username_normalized,email,email_normalized,password_hash,nickname,role,status,created_at,updated_at)
            VALUES
              (1,'existing','existing','existing@example.com','existing@example.com','hash','Existing','user','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        """))

    flask_db("upgrade", "20260815_0004")
    inspector = inspect(engine)
    assert "account_tokens" in inspector.get_table_names()
    assert "email_verified_at" in {column["name"] for column in inspector.get_columns("users")}
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT email_verified_at FROM users WHERE id=1")) is None

    flask_db("downgrade", "20260815_0003")
    inspector = inspect(engine)
    assert "account_tokens" not in inspector.get_table_names()
    assert "email_verified_at" not in {column["name"] for column in inspector.get_columns("users")}
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT COUNT(*) FROM users WHERE id=1")) == 1
