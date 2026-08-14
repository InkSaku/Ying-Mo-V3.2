from pathlib import Path
import compileall
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
PROJECT_ROOT = ROOT.parent

if not compileall.compile_dir(ROOT / "app", quiet=1):
    raise SystemExit("Python compile failed")
if not compileall.compile_dir(ROOT / "tests", quiet=1):
    raise SystemExit("Test compile failed")
if not compileall.compile_dir(ROOT / "migrations", quiet=1):
    raise SystemExit("Migration compile failed")

required = [
    ROOT / "app/models/user.py",
    ROOT / "app/models/post.py",
    ROOT / "app/models/collection.py",
    ROOT / "app/access.py",
    ROOT / "migrations/versions/20260814_0001_v32_initial.py",
    ROOT / "migrations/versions/20260814_0002_p0_release_schema.py",
    ROOT / "app/models/admin.py",
    ROOT / "app/storage.py",
    PROJECT_ROOT / "docs/backend/P0_ACCEPTANCE.md",
    PROJECT_ROOT / "docs/product.md",
]
missing = [str(p.relative_to(PROJECT_ROOT)) for p in required if not p.exists()]
if missing:
    raise SystemExit(f"Missing required files: {missing}")

app_text = "\n".join(p.read_text(encoding="utf-8") for p in (ROOT / "app").rglob("*.py"))
for forbidden in (
    r"\bcan_publish\b", r"\bcan_comment\b", r"\bcontent_admin\b",
    r"\breview_status\b", r"\bcontribution_policy\b", r"\bowner_only\b",
    r"\bapproved_members\b", r"\blife_post\b", r"\blife_chapter\b",
    r"\bgame_guide\b", r"\breports?\b", r"\bpublisher\b",
):
    if re.search(forbidden, app_text, flags=re.IGNORECASE):
        raise SystemExit(f"Legacy business field found in app code: {forbidden}")

collection_model = (ROOT / "app/models/collection.py").read_text(encoding="utf-8")
if "CollectionMember" not in collection_model or "__tablename__ = \"collection_members\"" not in collection_model:
    raise SystemExit("collection_members relation missing")
if "visibility =" in collection_model:
    raise SystemExit("Collection visibility must not exist")

post_model = (ROOT / "app/models/post.py").read_text(encoding="utf-8")
if "visibility IN ('login_only', 'private')" not in post_model:
    raise SystemExit("Post visibility DB check missing")

blueprints = (ROOT / "app/blueprints.py").read_text(encoding="utf-8")
for retired in ("games", "guides", "life", "reports"):
    if re.search(rf"\b{retired}\b", blueprints, flags=re.IGNORECASE):
        raise SystemExit(f"Retired blueprint found: {retired}")

required_tables = {"featured_content", "site_settings", "admin_logs", "collection_members", "article_slugs"}
model_text = "\n".join(p.read_text(encoding="utf-8") for p in (ROOT / "app/models").glob("*.py"))
for table in required_tables:
    if f'__tablename__ = "{table}"' not in model_text:
        raise SystemExit(f"Required P0 table model missing: {table}")

print("STATIC_VERIFY_OK")
