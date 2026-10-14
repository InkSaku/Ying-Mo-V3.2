"""Live QR feasibility check. No binding or message sending; credentials stay in memory."""
import argparse
import os
from pathlib import Path
import sys
import uuid

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--probe", action="store_true", help="Only verify QR rendering, without waiting for login")
    args = parser.parse_args()
    from app import create_app
    from app.spark.login_browser import observe_login, LoginBrowserError
    from app.spark.worker import worker_lock
    app = create_app()
    import logging
    logging.getLogger("douyin-spark").disabled = True
    path = ROOT / f"instance/spark-qr-spike-{uuid.uuid4().hex[:8]}.png"
    path.parent.mkdir(exist_ok=True, mode=0o700)
    class ProbeDone(Exception):
        pass
    def on_qr(image):
        with path.open("wb") as handle:
            os.fchmod(handle.fileno(), 0o600)
            handle.write(image)
        print(f"QR_READY {path}", flush=True)
        if args.probe:
            raise ProbeDone()
    with app.app_context(), worker_lock(app.config["SPARK_WORKER_LOCK"]):
        try:
            state, _ = observe_login(on_qr, lambda status, diagnostics=None: print(f"LOGIN_STATUS {status}", flush=True) if diagnostics is None else None, lambda: None)
            from app.spark.context import _execution
            from app.spark.service import DEFAULT_CONFIG
            from app.spark.driver import PlaywrightDriver
            token = _execution.set({"state": state, "config": DEFAULT_CONFIG})
            try:
                with PlaywrightDriver(DEFAULT_CONFIG) as driver:
                    status, contacts = driver.sync()
                print(f"LOGIN_RESTORE status={status} contacts={len(contacts)}", flush=True)
            finally:
                _execution.reset(token)
        except ProbeDone:
            print("QR_PROBE_OK (browser closed; this QR cannot be used for login)")
        except LoginBrowserError as error:
            raise SystemExit(f"LOGIN_PROBE_{error.status.upper()}: {error.reason}") from None
        finally:
            if not args.probe:
                path.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
