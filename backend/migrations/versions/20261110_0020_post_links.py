"""Record in-site links between posts and backfill them from existing bodies.

Revision ID: 20261110_0020
Revises: 20261109_0019
"""
import os
import re
from datetime import datetime, timezone
from urllib.parse import urlsplit

from alembic import op
import sqlalchemy as sa

revision = "20261110_0020"
down_revision = "20261109_0019"
branch_labels = None
depends_on = None

# 与 app/posts/links.py 的解析规则一致；迁移不导入应用代码，免得以后改动影响历史迁移。
ARTICLE_PATH_RE = re.compile(r"^/articles/([a-z0-9]+(?:-[a-z0-9]+)*)/?$")
NOTE_PATH_RE = re.compile(r"^/notes/(\d{1,18})/?$")
LINK_TOKEN_RE = re.compile(r"https?://[^\s<>()\[\]\"']+|(?<![\w/.])/(?:articles|notes)/[^\s<>()\[\]\"']+")
FENCED_CODE_RE = re.compile(r"(^|\n)(```|~~~)[^\n]*\n.*?(\n\2[^\n]*(?=\n|$)|$)", re.S)
INLINE_CODE_RE = re.compile(r"`[^`\n]*`")
TRAILING_PUNCTUATION = ".,;:!?。，；：！？、"


def _link_key(href, site_netloc):
    try:
        parts = urlsplit(href.rstrip(TRAILING_PUNCTUATION))
    except ValueError:
        return None
    if parts.scheme or parts.netloc:
        if parts.scheme not in {"http", "https"} or parts.netloc.lower() != site_netloc:
            return None
    article = ARTICLE_PATH_RE.fullmatch(parts.path)
    if article:
        return ("article", article.group(1))
    note = NOTE_PATH_RE.fullmatch(parts.path)
    if note:
        return ("note", int(note.group(1)))
    return None


def upgrade():
    op.create_table(
        "post_links",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source_post_id", sa.Integer(), nullable=False),
        sa.Column("target_post_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["source_post_id"], ["posts.id"], name="fk_post_links_source", ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["target_post_id"], ["posts.id"], name="fk_post_links_target", ondelete="CASCADE",
        ),
        sa.UniqueConstraint("source_post_id", "target_post_id", name="uq_post_links_pair"),
        sa.CheckConstraint("source_post_id <> target_post_id", name="ck_post_links_distinct_posts"),
    )
    op.create_index("ix_post_links_target", "post_links", ["target_post_id"])

    bind = op.get_bind()
    site_netloc = urlsplit(os.getenv("SITE_URL", "http://localhost:5173")).netloc.lower()
    slugs = dict(bind.execute(sa.text("SELECT slug, post_id FROM article_slugs")).all())
    notes = set(bind.execute(sa.text("SELECT id FROM posts WHERE post_type = 'note'")).scalars().all())
    now = datetime.now(timezone.utc)
    rows = []
    for post_id, body in bind.execute(sa.text("SELECT id, body FROM posts WHERE body IS NOT NULL")).all():
        text = INLINE_CODE_RE.sub(" ", FENCED_CODE_RE.sub("\n", body))
        targets = set()
        for token in LINK_TOKEN_RE.findall(text):
            key = _link_key(token, site_netloc)
            if key is None:
                continue
            target = slugs.get(key[1]) if key[0] == "article" else (key[1] if key[1] in notes else None)
            if target is not None and target != post_id:
                targets.add(target)
        rows += [{"source_post_id": post_id, "target_post_id": target, "created_at": now} for target in sorted(targets)]
    if rows:
        op.bulk_insert(sa.table(
            "post_links",
            sa.column("source_post_id", sa.Integer()),
            sa.column("target_post_id", sa.Integer()),
            sa.column("created_at", sa.DateTime(timezone=True)),
        ), rows)


def downgrade():
    op.drop_index("ix_post_links_target", table_name="post_links")
    op.drop_table("post_links")
