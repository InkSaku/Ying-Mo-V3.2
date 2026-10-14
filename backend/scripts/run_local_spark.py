"""Prepare local credential storage, check Chromium, then run the real worker."""

import argparse
import fcntl
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit

from cryptography.fernet import Fernet
from dotenv import dotenv_values


ROOT = Path(__file__).resolve().parent.parent


def prepare_local_env(root=ROOT):
    instance = root / "instance"
    instance.mkdir(mode=0o700, exist_ok=True)
    with (instance / "spark-local-setup.lock").open("a+") as lock:
        os.fchmod(lock.fileno(), 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX)
        return _prepare_local_env(root)


def _prepare_local_env(root):
    env_path = root / ".env"
    if not env_path.is_file():
        raise ValueError("请先将 backend/.env.example 复制为 backend/.env 并完成本地数据库配置。")
    values = dotenv_values(env_path)
    environment = {**values, **os.environ}
    if environment.get("APP_ENV", "development") != "development":
        raise ValueError("此脚本仅用于 APP_ENV=development；生产环境请按 README 配置独立服务。")
    url = urlsplit(environment.get("DATABASE_URL") or "sqlite+pysqlite:///yingmo_dev.db")
    if not url.scheme.startswith("sqlite") and url.hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError("此脚本仅用于本机数据库，不会启动连接远程数据库的 worker。")
    key = (environment.get("SPARK_CREDENTIAL_KEY") or "").strip()
    created = not key
    if created:
        key = Fernet.generate_key().decode()
        content = env_path.read_text(encoding="utf-8")
        lines = content.splitlines(keepends=True)
        # Replace only this setting; preserve all other local configuration.
        lines = [line for line in lines if not re.match(r"^\s*(?:export\s+)?SPARK_CREDENTIAL_KEY\s*=", line)]
        content = "".join(lines)
        if content and not content.endswith("\n"):
            content += "\n"
        content += f"SPARK_CREDENTIAL_KEY={key}\n"
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=root, delete=False) as handle:
                temporary = Path(handle.name)
                os.fchmod(handle.fileno(), 0o600)
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
            temporary.replace(env_path)
        finally:
            if temporary and temporary.exists():
                temporary.unlink()
    try:
        Fernet(key.encode())
    except (ValueError, TypeError):
        raise ValueError("现有 SPARK_CREDENTIAL_KEY 无效，请检查配置；脚本不会替换已有密钥。") from None
    env_path.chmod(0o600)
    child_env = dict(os.environ)
    child_env.update(APP_ENV="development", SPARK_CREDENTIAL_KEY=key)
    return child_env, created


def main():
    parser = argparse.ArgumentParser(description="启动本地续火花后台，自动保存首次使用的加密密钥。")
    parser.add_argument("--check", action="store_true", help="只准备密钥并检查数据库和 Chromium，不启动后台")
    args = parser.parse_args()
    try:
        environment, created = prepare_local_env()
    except ValueError as error:
        raise SystemExit(str(error)) from None
    if created:
        print("已将本地加密密钥保存到 backend/.env（未显示密钥）。请重启已运行的网站后端一次。", flush=True)
    os.chdir(ROOT)
    command = [sys.executable, "-m", "app.spark.worker"]
    checked = subprocess.run([*command, "--check"], env=environment)
    if checked.returncode:
        raise SystemExit("本地检查未通过。请确认已执行 flask --app run.py db upgrade 和 python -m playwright install chromium。")
    if args.check:
        return
    print("本地续火花后台已启动；保持此终端运行，按 Ctrl+C 停止。", flush=True)
    os.execve(sys.executable, command, environment)


if __name__ == "__main__":
    main()
