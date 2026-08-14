import os
import subprocess
import sys
from pathlib import Path

from sqlalchemy import create_engine, inspect, text

from app import create_app
from app.extensions import db


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
