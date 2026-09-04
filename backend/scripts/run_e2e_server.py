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

        app.run(host="127.0.0.1", port=8775, use_reloader=False)


if __name__ == "__main__":
    main()
