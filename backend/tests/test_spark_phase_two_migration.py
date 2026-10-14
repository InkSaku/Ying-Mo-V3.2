from io import StringIO
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


def test_second_phase_migration_preserves_legacy_plan_and_roundtrips(tmp_path):
    root = Path(__file__).resolve().parents[1]
    url = f"sqlite+pysqlite:///{tmp_path / 'phase-two.db'}"
    env = {**os.environ, "DATABASE_URL": url}
    def migrate(*args):
        result = subprocess.run([sys.executable, "-m", "flask", "--app", "run.py", "db", *args], cwd=root, env=env, capture_output=True, text=True)
        assert result.returncode == 0, result.stdout + result.stderr
    migrate("upgrade", "20261014_0014")
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(text("""INSERT INTO users
          (id,username,username_normalized,email,email_normalized,password_hash,nickname,role,status,created_at,updated_at)
          VALUES (1,'legacy','legacy','legacy@example.com','legacy@example.com','hash','Legacy','user','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"""))
        connection.execute(text("""INSERT INTO spark_accounts (user_id,credential_revision,plan_revision,config,session_status,created_at,updated_at)
          VALUES (1,7,2,:config,'ready',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"""), {"config": json.dumps({"messages": ["original"]})})
    migrate("upgrade")
    with engine.connect() as connection:
        row = connection.execute(text("SELECT config,credential_revision,onboarding_required FROM spark_accounts WHERE user_id=1")).first()
        assert json.loads(row.config) == {"messages": ["original"], "auto_run_enabled": True}
        assert row.credential_revision == 7 and row.onboarding_required == 0
    assert "spark_login_sessions" in inspect(engine).get_table_names()
    migrate("downgrade", "20261014_0014")
    assert "spark_login_sessions" not in inspect(engine).get_table_names()
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT credential_revision FROM spark_accounts WHERE user_id=1")) == 7
    migrate("upgrade")
    assert "spark_login_sessions" in inspect(engine).get_table_names()


def test_second_phase_mysql_ddl_has_private_large_ciphertext_and_indexes():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/20261014_0015_spark_phase_two.py"
    spec = importlib.util.spec_from_file_location("spark_phase_two_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    output = StringIO()
    context = MigrationContext.configure(dialect_name="mysql", opts={"as_sql": True, "output_buffer": output})
    with Operations.context(context):
        module.upgrade()
    sql = output.getvalue()
    assert sql.count("MEDIUMTEXT") == 2
    assert "DROP" not in sql and "spark_login_sessions" in sql
    assert "ix_spark_login_sessions_expires_at" in sql
