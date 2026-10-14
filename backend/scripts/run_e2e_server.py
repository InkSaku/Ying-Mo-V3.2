"""Run an isolated local backend for Playwright editor tests."""

import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory


def main():
    project_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(project_root))
    with TemporaryDirectory(prefix="yingmo-e2e-") as directory:
        root = Path(directory)
        os.environ["TEST_DATABASE_URL"] = f"sqlite+pysqlite:///{root / 'e2e.db'}"
        os.environ["UPLOAD_ROOT"] = str(root / "uploads")
        os.environ["REGISTRATION_INVITE_CODE"] = "e2e-invite"
        os.environ["SITE_URL"] = "http://127.0.0.1:8776"

        from app import create_app
        from app.extensions import db
        from app.models import User

        app = create_app(
            "testing",
            {
                "RATELIMIT_ENABLED": False,
                "SITE_URL": "http://127.0.0.1:8776",
                "UPLOAD_ROOT": root / "uploads",
            },
        )
        if os.getenv("SPARK_E2E") == "1":
            # Only this isolated testing server can use the offline test driver.
            assert app.testing
            import threading
            import time
            from cryptography.fernet import Fernet
            from app.spark.worker import claim_job, heartbeat
            from app.spark.executor import execute_job
            from app.spark.login_session import claim_login, run_login, sweep_sessions
            from spark_e2e_driver import SparkE2EDriver, observe_e2e_login
            app.config["SPARK_CREDENTIAL_KEY"] = Fernet.generate_key().decode()
            def spark_loop():
                while True:
                    with app.app_context():
                        heartbeat()
                        sweep_sessions()
                        job = claim_job()
                        if job:
                            execute_job(job.id, SparkE2EDriver, sleep=lambda _: None)
                        else:
                            session = claim_login()
                            if session:
                                run_login(session.id, observe_e2e_login)
                    time.sleep(0.2)
        with app.app_context():
            db.create_all()
            user = User(
                username="editor_e2e",
                username_normalized="editor_e2e",
                nickname="编辑器验收",
                email="editor-e2e@example.com",
                email_normalized="editor-e2e@example.com",
                email_verified_at=datetime.now(timezone.utc),
            )
            user.set_password("password123")
            db.session.add(user)
            db.session.commit()

        if os.getenv("SPARK_E2E") == "1":
            threading.Thread(target=spark_loop, daemon=True).start()

        app.run(host="127.0.0.1", port=8775, use_reloader=False)


if __name__ == "__main__":
    main()
