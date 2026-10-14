from cryptography.fernet import Fernet
from dotenv import dotenv_values
import pytest

from scripts.run_local_spark import prepare_local_env


@pytest.fixture
def local_env(tmp_path, monkeypatch):
    for name in ("APP_ENV", "DATABASE_URL", "SPARK_CREDENTIAL_KEY"):
        monkeypatch.delenv(name, raising=False)
    (tmp_path / ".env").write_text("APP_ENV=development\nDATABASE_URL=sqlite+pysqlite:///local.db\n# Keep this comment\nSECRET_KEY=existing-secret\n", encoding="utf-8")
    return tmp_path


def test_local_key_survives_repeated_startup(local_env):
    environment, created = prepare_local_env(local_env)
    assert created
    key = environment["SPARK_CREDENTIAL_KEY"]
    Fernet(key.encode())
    environment_again, created_again = prepare_local_env(local_env)
    assert not created_again
    assert environment_again["SPARK_CREDENTIAL_KEY"] == key
    values = dotenv_values(local_env / ".env")
    assert values["SPARK_CREDENTIAL_KEY"] == key
    assert values["SECRET_KEY"] == "existing-secret"
    assert "# Keep this comment" in (local_env / ".env").read_text()
    assert (local_env / ".env").stat().st_mode & 0o777 == 0o600


def test_local_startup_does_not_replace_invalid_key(local_env):
    path = local_env / ".env"
    original = path.read_text() + "SPARK_CREDENTIAL_KEY=invalid-existing-key\n"
    path.write_text(original)
    with pytest.raises(ValueError, match="不会替换已有密钥"):
        prepare_local_env(local_env)
    assert path.read_text() == original


@pytest.mark.parametrize("setting", ["APP_ENV=production", "APP_ENV=testing", "DATABASE_URL=mysql+pymysql://member@remote.example/site"])
def test_local_startup_rejects_other_environments_without_changing_config(local_env, setting):
    path = local_env / ".env"
    original = path.read_text() + setting + "\n"
    path.write_text(original)
    with pytest.raises(ValueError):
        prepare_local_env(local_env)
    assert path.read_text() == original


def test_empty_local_setting_is_replaced_once(local_env):
    path = local_env / ".env"
    path.write_text(path.read_text() + "export SPARK_CREDENTIAL_KEY = ''\n")
    environment, created = prepare_local_env(local_env)
    assert created
    assert path.read_text().count("SPARK_CREDENTIAL_KEY") == 1
    assert dotenv_values(path)["SPARK_CREDENTIAL_KEY"] == environment["SPARK_CREDENTIAL_KEY"]
