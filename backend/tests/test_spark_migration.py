from io import StringIO
import importlib.util
import os
from pathlib import Path
import subprocess
import sys

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text


def migration():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/20261014_0014_spark_phase_one.py"
    spec = importlib.util.spec_from_file_location("spark_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_spark_migration_roundtrip_preserves_existing_users(tmp_path):
    root = Path(__file__).resolve().parents[1]
    url = f"sqlite+pysqlite:///{tmp_path / 'spark.db'}"
    env = {**os.environ, "DATABASE_URL": url}
    def run(*args):
        response = subprocess.run([sys.executable, "-m", "flask", "--app", "run.py", "db", *args],
                                  cwd=root, env=env, capture_output=True, text=True)
        assert response.returncode == 0, response.stdout + response.stderr
    run("upgrade", "20260908_0013")
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(text("""INSERT INTO users
            (id,username,username_normalized,email,email_normalized,password_hash,nickname,role,status,created_at,updated_at)
            VALUES (1,'existing','existing','existing@example.com','existing@example.com','hash','Existing','user','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"""))
    run("upgrade")
    expected = {"spark_accounts", "spark_contacts", "spark_jobs", "spark_deliveries", "spark_worker_state"}
    assert expected.issubset(inspect(engine).get_table_names())
    run("downgrade", "20260908_0013")
    assert not expected.intersection(inspect(engine).get_table_names())
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT nickname FROM users WHERE id=1")) == "Existing"
    run("upgrade")
    assert expected.issubset(inspect(engine).get_table_names())


def test_spark_mysql_migration_emits_only_additive_tables_and_supports_large_ciphertext():
    output = StringIO()
    context = MigrationContext.configure(dialect_name="mysql", opts={"as_sql": True, "output_buffer": output})
    with Operations.context(context):
        migration().upgrade()
    sql = output.getvalue()
    assert "MEDIUMTEXT" in sql
    assert "DROP" not in sql and "ALTER TABLE" not in sql
    assert "uq_spark_delivery_day" in sql
