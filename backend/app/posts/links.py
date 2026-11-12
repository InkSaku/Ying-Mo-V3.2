"""正文里的站内链接：保存时记录“谁链接了谁”，阅读时给出“提到这篇的”和链接预览。

链接不授予任何权限：列表和预览都先按当前读者能否阅读来源过滤，读不到的不返回任何信息。
"""
import re
from urllib.parse import urlsplit

from flask import current_app

from app.access import readable_post_predicate
from app.extensions import db
from app.models import ArticleSlug, Post, PostLink, PostType

ARTICLE_PATH_RE = re.compile(r"^/articles/([a-z0-9]+(?:-[a-z0-9]+)*)/?$")
NOTE_PATH_RE = re.compile(r"^/notes/(\d{1,18})/?$")
# 完整网址或以 /articles/、/notes/ 开头的站内路径；Markdown 链接、自动链接和裸链接都能找到。
LINK_TOKEN_RE = re.compile(r"https?://[^\s<>()\[\]\"']+|(?<![\w/.])/(?:articles|notes)/[^\s<>()\[\]\"']+")
MARKDOWN_LINK_RE = re.compile(r"(?<!!)\[([^\]\n]*)\]\(\s*<?([^)\s>]+)>?(?:\s+\"[^\"]*\")?\s*\)")
FENCED_CODE_RE = re.compile(r"(^|\n)(```|~~~)[^\n]*\n.*?(\n\2[^\n]*(?=\n|$)|$)", re.S)
INLINE_CODE_RE = re.compile(r"`[^`\n]*`")
TRAILING_PUNCTUATION = ".,;:!?。，；：！？、"
CONTEXT_RADIUS = 36
MENTION_LIMIT = 50


def _site_netloc():
    return urlsplit(str(current_app.config.get("SITE_URL") or "")).netloc.lower()


def link_key(href):
    """把一个链接还原成 ("article", slug) 或 ("note", id)；站外链接返回 None。"""
    try:
        parts = urlsplit(href.rstrip(TRAILING_PUNCTUATION))
    except ValueError:
        return None
    if parts.scheme or parts.netloc:
        if parts.scheme not in {"http", "https"} or parts.netloc.lower() != _site_netloc():
            return None
    article = ARTICLE_PATH_RE.fullmatch(parts.path)
    if article:
        return ("article", article.group(1))
    note = NOTE_PATH_RE.fullmatch(parts.path)
    if note:
        return ("note", int(note.group(1)))
    return None


def _without_code(body):
    return INLINE_CODE_RE.sub(" ", FENCED_CODE_RE.sub("\n", body or ""))


def _resolve(keys):
    """链接键到 Post ID：文章按任一历史网址解析，随记按 ID 解析。"""
    slugs = {value for kind, value in keys if kind == "article"}
    note_ids = {value for kind, value in keys if kind == "note"}
    resolved = {}
    if slugs:
        for slug, post_id in db.session.execute(
            db.select(ArticleSlug.slug, ArticleSlug.post_id).where(ArticleSlug.slug.in_(slugs))
        ).all():
            resolved[("article", slug)] = post_id
    if note_ids:
        for post_id in db.session.scalars(db.select(Post.id).where(
            Post.id.in_(note_ids), Post.post_type == PostType.NOTE.value,
        )).all():
            resolved[("note", post_id)] = post_id
    return resolved


def linked_post_ids(post):
    keys = {key for key in (link_key(token) for token in LINK_TOKEN_RE.findall(_without_code(post.body))) if key}
    return set(_resolve(keys).values()) - {post.id}


def sync_post_links(post):
    """正文变化后调用；草稿的链接也记下，阅读时再按来源是否可读过滤。"""
    targets = linked_post_ids(post)
    existing = {
        link.target_post_id: link
        for link in db.session.scalars(db.select(PostLink).where(PostLink.source_post_id == post.id)).all()
    }
    for target_id, link in existing.items():
        if target_id not in targets:
            db.session.delete(link)
    for target_id in sorted(targets - set(existing)):
        db.session.add(PostLink(source_post_id=post.id, target_post_id=target_id))


def discard_post_links(post_id):
    db.session.execute(db.delete(PostLink).where(
        db.or_(PostLink.source_post_id == post_id, PostLink.target_post_id == post_id)
    ))


def _plain(text):
    text = MARKDOWN_LINK_RE.sub(lambda match: match.group(1), text)
    text = re.sub(r"\[\[ym-media:\d+\]\]|\{#ym-h-[^}]+\}", " ", text)
    text = re.sub(r"[`*_#>~|]+", " ", text)
    return " ".join(text.split())


def _target_keys(post):
    """一篇帖子所有可能被链接的写法：文章的每个历史网址，或随记的 ID。"""
    if post.post_type == PostType.NOTE.value:
        return {("note", post.id)}
    return {("article", slug) for slug in db.session.scalars(
        db.select(ArticleSlug.slug).where(ArticleSlug.post_id == post.id)
    ).all()}


def _mention_context(body, target_keys):
    """找到提到目标的那一段，截取链接文字前后的一小段原话。"""
    for paragraph in re.split(r"\n\s*\n", _without_code(body)):
        label = None
        for match in MARKDOWN_LINK_RE.finditer(paragraph):
            if link_key(match.group(2)) in target_keys:
                label = match.group(1).strip()
                break
        if label is None and not any(link_key(token) in target_keys for token in LINK_TOKEN_RE.findall(paragraph)):
            continue
        plain = _plain(paragraph)
        if not plain:
            return ""
        index = plain.find(label) if label else -1
        if index < 0:
            return plain[: CONTEXT_RADIUS * 2] + ("…" if len(plain) > CONTEXT_RADIUS * 2 else "")
        start = max(0, index - CONTEXT_RADIUS)
        end = min(len(plain), index + len(label) + CONTEXT_RADIUS)
        return ("…" if start else "") + plain[start:end] + ("…" if end < len(plain) else "")
    return ""


def mentions_of(post, actor_id, *, exclude_ids=()):
    """当前读者能读到的、正文链接到这篇的帖子，按发布时间排列。"""
    from app.posts.continuations import post_reference

    sources = db.session.scalars(
        db.select(Post)
        .join(PostLink, PostLink.source_post_id == Post.id)
        .where(
            PostLink.target_post_id == post.id,
            Post.id != post.id,
            Post.id.not_in(list(exclude_ids) or [0]),
            readable_post_predicate(actor_id, include_archived=True),
        )
        .order_by(Post.published_at.asc(), Post.id.asc())
        .limit(MENTION_LIMIT)
    ).all()
    target_keys = _target_keys(post) if sources else set()
    return [{
        **post_reference(item),
        "author": {"nickname": item.author.nickname} if item.author else None,
        "context": _mention_context(item.body, target_keys),
    } for item in sources]


def link_preview(path, actor_id):
    """悬停预览与评论卡片预览：只接受站内文章或随记路径，读不到和不存在都返回 None。"""
    key = link_key(path) if isinstance(path, str) and path.startswith("/") else None
    if key is None:
        return None
    post_id = _resolve({key}).get(key)
    post = db.session.get(Post, post_id) if post_id else None
    return post_cards([post], actor_id).get(post_id) if post is not None else None


def post_cards(posts, actor_id):
    """站内帖子卡片：只为当前读者能读的帖子给出标题、摘录、作者、首图和图片数。"""
    from app.access import can_read_post
    from app.posts.browsing import first_display_media, note_visual_counts
    from app.posts.continuations import post_preview

    readable = [
        post for post in {post.id: post for post in posts if post is not None}.values()
        if actor_id is not None and can_read_post(actor_id, post, include_archived=True)
    ]
    if not readable:
        return {}
    first_media = first_display_media(readable)
    counts = note_visual_counts(readable)
    cards = {}
    for post in readable:
        cover = post.cover_media
        media = cover if cover and cover.status == "active" and cover.deleted_at is None else first_media.get(post.id)
        cards[post.id] = {
            **post_preview(post, actor_id),
            "display_media": media.to_dict() if media else None,
            "visual_count": counts.get(post.id, 0) if post.post_type == PostType.NOTE.value else None,
        }
    return cards


# 评论是纯文本：网址只取 ASCII 字符，紧跟的中文和中文标点不算进链接。
COMMENT_LINK_RE = re.compile(
    r"https?://[A-Za-z0-9.\-]+(?::\d+)?(?:/[A-Za-z0-9\-._~/%?#=&+]*)?"
    r"|(?<![A-Za-z0-9_/.])/(?:articles|notes)/[A-Za-z0-9\-_/]+"
)


def first_comment_link(body):
    """评论里的第一个站内文章或随记链接，返回 (正文里的那段文字, 链接键)。"""
    for match in COMMENT_LINK_RE.finditer(body or ""):
        token = match.group(0).rstrip(TRAILING_PUNCTUATION)
        key = link_key(token)
        if key:
            return token, key
    return None, None


def comment_link_cards(comments, actor_id):
    """每条 active 评论最多一张卡片，按当前读者现取；读不到、不存在都只给 unavailable。

    指向被评论帖子本身的链接、作者选了“不附卡片”的评论都不出卡片。
    """
    found = {}
    for comment in comments:
        if comment.status != "active" or getattr(comment, "link_card_hidden", False):
            continue
        token, key = first_comment_link(comment.body)
        if key:
            found[comment.id] = (comment.post_id, token, key)
    if not found:
        return {}
    resolved = _resolve({key for _, _, key in found.values()})
    posts = db.session.scalars(db.select(Post).where(Post.id.in_(set(resolved.values())))).all() if resolved else []
    cards = post_cards(posts, actor_id)
    result = {}
    for comment_id, (commented_post_id, token, key) in found.items():
        post_id = resolved.get(key)
        if post_id == commented_post_id:
            continue
        result[comment_id] = {"href": token, **cards.get(post_id, {"state": "unavailable"})}
    return result
