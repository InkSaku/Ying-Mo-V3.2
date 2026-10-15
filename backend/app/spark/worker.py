"""One worker, one browser subprocess, persistent database queue.

Run with: python -m app.spark.worker
"""
import argparse
from contextlib import contextmanager
import fcntl
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

from app import create_app
from app.extensions import db
from app.models import SparkJob, SparkWorkerState, SparkLoginSession, SparkAccount
from app.models.spark import now_utc
from .credentials import credential_cipher
from .executor import assert_active, Cancelled, execute_job, interrupted
from .service import schedule_due
from .login_session import claim_login, sweep_sessions, assert_login_active, run_login, terminate_login, LoginBrowserError


@contextmanager
def worker_lock(path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with path.open("a+") as handle:
        os.chmod(path, 0o600)
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError("续火花后台已在运行，拒绝启动第二个实例。") from None
        yield handle.fileno()


def heartbeat():
    worker = db.session.get(SparkWorkerState, 1)
    if worker is None:
        worker = SparkWorkerState(id=1)
        db.session.add(worker)
    worker.heartbeat_at = now_utc()
    db.session.commit()


def recover_interrupted():
    # Held flock (inherited by the executor) proves old jobs are no longer alive.
    for job in db.session.scalars(db.select(SparkJob).where(SparkJob.status == "running")).all():
        interrupted(job.id, "服务已重启；不自动重放中断的发送，请检查执行结果")


def claim_job(now=None, kinds=None, sources=None):
    now = now or now_utc()
    query = db.select(SparkJob).where(SparkJob.status == "queued", SparkJob.scheduled_at <= now)
    if kinds:
        query = query.where(SparkJob.kind.in_(kinds))
    if sources:
        query = query.where(SparkJob.source.in_(sources))
    job = db.session.scalar(query.order_by(SparkJob.scheduled_at, SparkJob.created_at).limit(1).with_for_update())
    if job:
        job.status, job.started_at = "running", now
        db.session.commit()
    return job


def next_work(now=None):
    """Due sends first; QR next; other manual work gets a turn between QR sessions."""
    job = claim_job(now, ("send",), ("daily", "retry"))
    if job:
        return "job", job.id
    login = claim_login(now)
    if login:
        return "login", login.id
    job = claim_job(now)
    return ("job", job.id) if job else None


def run_subprocess(app, job_id, lock_fd, *, login=False):
    process = subprocess.Popen([sys.executable, "-m", "app.spark.worker", "--login-session" if login else "--execute", job_id, "--lock-fd", str(lock_fd)],
        start_new_session=True, pass_fds=(lock_fd,), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    deadline = time.monotonic() + (320 if login else app.config["SPARK_TASK_TIMEOUT_SECONDS"])
    reason = None
    try:
        while process.poll() is None:
            heartbeat()
            try:
                assert_login_active(job_id) if login else assert_active(job_id)
                if login:
                    db.session.commit()
            except (Cancelled, LoginBrowserError):
                reason = "任务已停止；已尝试发送的结果需要到抖音确认"
            if time.monotonic() >= deadline:
                reason = "执行超时；已尝试发送的结果需要到抖音确认"
            if reason:
                break
            time.sleep(1)
    finally:
        # Always reap Chromium descendants, even after the executor exited.
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
        # Expiring ORM objects does not end MySQL's repeatable-read snapshot.
        # Read the child's final commit in a fresh transaction.
        db.session.rollback()
        if login:
            terminate_login(job_id, "expired" if time.monotonic() >= deadline else "interrupted", "连接已结束或中断，请重新扫码。")
        else:
            interrupted(job_id, reason or "执行进程中断，请检查结果后重试")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute")
    parser.add_argument("--login-session")
    parser.add_argument("--lock-fd", type=int, help=argparse.SUPPRESS)
    parser.add_argument("--once", action="store_true", help="Schedule and execute at most one due job")
    parser.add_argument("--check", action="store_true", help="Check database, key and Chromium without accessing Douyin")
    args = parser.parse_args()
    app = create_app()
    with app.app_context():
        credential_cipher()  # Fail before accepting work if the key is missing/invalid.
        if args.check:
            db.session.execute(db.select(SparkWorkerState.id).limit(1))
            db.session.execute(db.select(SparkLoginSession.id).limit(1))
            db.session.execute(db.select(SparkAccount.login_generation).limit(1))
            from playwright.sync_api import sync_playwright
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True, chromium_sandbox=True, args=["--disable-dev-shm-usage"])
                browser.close()
            print("SPARK_CHECK_OK database=ready encryption=ready chromium=ready")
            return
        if args.execute or args.login_session:
            if args.lock_fd is None:
                parser.error("--execute 仅供持有单实例锁的后台调用")
            expected = Path(app.config["SPARK_WORKER_LOCK"]).stat()
            inherited = os.fstat(args.lock_fd)
            if (expected.st_dev, expected.st_ino) != (inherited.st_dev, inherited.st_ino):
                parser.error("执行进程没有继承正确的单实例锁")
            fcntl.flock(args.lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            if args.login_session:
                assert_login_active(args.login_session)
                db.session.commit()
                run_login(args.login_session)
                return
            job = db.session.get(SparkJob, args.execute)
            if not job or job.status != "running":
                parser.error("执行任务尚未被后台领取")
            execute_job(args.execute)
            return
        with worker_lock(app.config["SPARK_WORKER_LOCK"]) as lock_fd:
            recover_interrupted()
            sweep_sessions(recover=True)
            while True:
                heartbeat()
                sweep_sessions()
                schedule_due()
                work = next_work()
                if work:
                    run_subprocess(app, work[1], lock_fd, login=work[0] == "login")
                    if work[0] == "login":
                        # Fairness: after one bounded QR wait, service one other ready job.
                        if not args.once:
                            job = claim_job()
                            if job:
                                run_subprocess(app, job.id, lock_fd)
                if args.once:
                    break
                db.session.remove()
                time.sleep(2)


if __name__ == "__main__":
    main()
