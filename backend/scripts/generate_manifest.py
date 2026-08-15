"""Generate or verify the reproducible backend source checksum manifest."""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "MANIFEST.sha256"
EXCLUDED_TREE_PARTS = {
    ".git",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".venv",
    "__pycache__",
}
EXCLUDED_ROOT_DIRECTORIES = {"instance", "uploads"}
EXCLUDED_NAMES = {
    ".DS_Store",
    ".coverage",
    ".env",
    "MANIFEST.sha256",
    "MANIFEST.sha256.tmp",
}


def source_files():
    return sorted(
        (
            path
            for path in ROOT.rglob("*")
            if path.is_file()
            and path.name not in EXCLUDED_NAMES
            and not EXCLUDED_TREE_PARTS.intersection(path.relative_to(ROOT).parts)
            and path.relative_to(ROOT).parts[0] not in EXCLUDED_ROOT_DIRECTORIES
        ),
        key=lambda path: path.relative_to(ROOT).as_posix(),
    )


def render_manifest():
    lines = []
    for path in source_files():
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        lines.append(f"{digest}  {path.relative_to(ROOT).as_posix()}")
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    rendered = render_manifest()
    if args.check:
        current = MANIFEST.read_text(encoding="utf-8") if MANIFEST.exists() else ""
        if current != rendered:
            raise SystemExit("MANIFEST_OUT_OF_DATE: run python scripts/generate_manifest.py")
        print(f"MANIFEST_VERIFY_OK files={len(rendered.splitlines())}")
        return

    temporary = MANIFEST.with_suffix(".sha256.tmp")
    temporary.write_text(rendered, encoding="utf-8")
    temporary.replace(MANIFEST)
    print(f"MANIFEST_GENERATED files={len(rendered.splitlines())}")


if __name__ == "__main__":
    main()
