"""接着写：作者接着自己发布过的帖子继续写，同一串帖子读者一致。

一串帖子固定在同一个地方：都在同一个合集，或都不在合集里。合集内读者天然一致；
合集外只有“仅自己”和“所有映墨成员”两种范围，取并集时只会把私密的放大成全体成员。
"""
from datetime import datetime, timezone

from sqlalchemy import or_

from app.access import can_read_post, is_collection_member, readable_post_predicate
from app.common.time import isoformat_utc
from app.extensions import db
from app.models import Post, PostContinuation, PostStatus, PostType, PostVisibility
from app.posts.service import DomainError, current_article_slug

READABLE_STATES = (PostStatus.PUBLISHED.value, PostStatus.ARCHIVED.value)
EXCERPT_LIMIT = 240


def utcnow():
    return datetime.now(timezone.utc)


def _active_link(post_id):
    return db.session.scalar(db.select(PostContinuation).where(
        PostContinuation.post_id == post_id,
        PostContinuation.broken_at.is_(None),
    ))


def chain_post_ids(post_id):
    """沿有效关系向前后走完，返回这一串的全部 Post ID（至少包含自己）。"""
    seen = {post_id}
    frontier = {post_id}
    while frontier:
        rows = db.session.execute(
            db.select(PostContinuation.post_id, PostContinuation.source_post_id).where(
                PostContinuation.broken_at.is_(None),
                or_(
                    PostContinuation.post_id.in_(frontier),
                    PostContinuation.source_post_id.in_(frontier),
                ),
            )
        ).all()
        frontier = {post for row in rows for post in row} - seen
        seen |= frontier
    return seen


def _published_chain_members(post):
    """这一串里除自己外已发布过的帖子；删除的帖子不再参与读者范围。"""
    others = chain_post_ids(post.id) - {post.id}
    if not others:
        return []
    return db.session.scalars(
        db.select(Post).where(
            Post.id.in_(others),
            Post.deleted_at.is_(None),
            Post.status.in_(READABLE_STATES),
        ).order_by(Post.id.asc())
    ).all()


def _open_to_all(posts):
    return any(
        item.collection_id is None and item.visibility == PostVisibility.LOGIN_ONLY.value
        for item in posts
    )


def _canonical(post):
    if post.post_type == PostType.ARTICLE.value:
        slug = current_article_slug(post.id) or post.slug_candidate
        return f"/articles/{slug}" if slug else None
    return f"/notes/{post.id}"


def _post_reference(post):
    return {
        "id": post.id,
        "post_type": post.post_type,
        "title": post.title,
        "content_excerpt": (post.summary or post.body or "")[:EXCERPT_LIMIT],
        "canonical": _canonical(post),
        "published_at": isoformat_utc(post.published_at),
    }


def _source_view(source, actor_id):
    """失去读取权限或原帖已删除时不返回任何标题、作者或内容。"""
    if source is None or actor_id is None or not can_read_post(actor_id, source, include_archived=True):
        return {"state": "unavailable"}
    return {
        "state": "available",
        **_post_reference(source),
        "author": {"nickname": source.author.nickname} if source.author else None,
    }


def continuation_previews(posts, actor_id):
    """列表行用：批量读取来源，只查一次关系表。"""
    ids = [post.id for post in posts]
    if not ids:
        return {}
    links = db.session.scalars(db.select(PostContinuation).where(
        PostContinuation.post_id.in_(ids),
        PostContinuation.broken_at.is_(None),
    )).all()
    return {link.post_id: _source_view(link.source_post, actor_id) for link in links}


def _later_posts(post, actor_id):
    seen = {post.id}
    frontier = {post.id}
    later = set()
    while frontier:
        found = set(db.session.scalars(db.select(PostContinuation.post_id).where(
            PostContinuation.broken_at.is_(None),
            PostContinuation.source_post_id.in_(frontier),
        )).all())
        frontier = found - seen
        seen |= frontier
        later |= frontier
    if not later:
        return []
    return db.session.scalars(
        db.select(Post).where(
            Post.id.in_(later),
            readable_post_predicate(actor_id, include_archived=True),
        ).order_by(Post.published_at.asc(), Post.id.asc())
    ).all()


def can_continue(post, actor_id):
    if post is None or post.author_id != actor_id or post.status not in READABLE_STATES:
        return False
    if not can_read_post(actor_id, post, include_archived=True):
        return False
    return post.collection_id is None or is_collection_member(actor_id, post.collection, current_read=True)


def continuation_detail(post, actor_id):
    link = _active_link(post.id)
    return {
        "source": _source_view(link.source_post, actor_id) if link else None,
        "later": [_post_reference(item) for item in _later_posts(post, actor_id)],
        "can_continue": can_continue(post, actor_id),
    }


def continuation_management(post):
    """写作页用：来源、这一串的成员和当前读者范围。"""
    link = _active_link(post.id)
    members = _published_chain_members(post)
    if link is None and not members:
        return None
    return {
        "is_continuation": link is not None,
        "source": _source_view(link.source_post, post.author_id) if link else None,
        "chain_visibility": (
            PostVisibility.LOGIN_ONLY.value if _open_to_all(members) else PostVisibility.PRIVATE.value
        ),
        "chain_posts": [{**_post_reference(item), "visibility": item.visibility} for item in members],
    }


def posts_in_chains(post_ids):
    ids = list(post_ids)
    if not ids:
        return set()
    rows = db.session.execute(
        db.select(PostContinuation.post_id, PostContinuation.source_post_id).where(
            PostContinuation.broken_at.is_(None),
            or_(PostContinuation.post_id.in_(ids), PostContinuation.source_post_id.in_(ids)),
        )
    ).all()
    return {post for row in rows for post in row} & set(ids)


def create_continuation_draft(source, actor):
    """调用方已持有原帖行锁，同一篇连点两次会回到同一份草稿。"""
    if not can_read_post(actor.id, source, include_archived=True):
        raise DomainError("RESOURCE_NOT_FOUND", "Post 不存在。", 404)
    if source.author_id != actor.id:
        raise DomainError("PERMISSION_DENIED", "目前只能接着写自己的帖子。", 403)
    if not can_continue(source, actor.id):
        raise DomainError("PERMISSION_DENIED", "你已不再属于这个合集，不能在这里接着写。", 403)

    existing = db.session.scalar(
        db.select(Post)
        .join(PostContinuation, PostContinuation.post_id == Post.id)
        .where(
            PostContinuation.source_post_id == source.id,
            PostContinuation.author_id == actor.id,
            PostContinuation.broken_at.is_(None),
            Post.status == PostStatus.DRAFT.value,
            Post.deleted_at.is_(None),
        )
        .order_by(Post.id.desc())
        .limit(1)
    )
    if existing is not None:
        return existing, False

    visibility = PostVisibility.PRIVATE.value
    if source.collection_id is None and _open_to_all([source, *_published_chain_members(source)]):
        visibility = PostVisibility.LOGIN_ONLY.value
    draft = Post(
        author_id=actor.id,
        post_type=source.post_type,
        status=PostStatus.DRAFT.value,
        visibility=visibility,
        collection_id=source.collection_id,
        collection_folder_id=source.collection_folder_id,
    )
    db.session.add(draft)
    db.session.flush()
    db.session.add(PostContinuation(post_id=draft.id, source_post_id=source.id, author_id=actor.id))
    return draft, True


def guard_continuation_patch(post, data):
    """保存时校验：接着写的草稿固定位置，读者范围跟着这一串走。"""
    if post.was_published:
        if (
            "visibility" in data
            and post.collection_id is None
            and data.get("collection_id") is None
            and data["visibility"] != post.visibility
            and len(chain_post_ids(post.id)) > 1
        ):
            raise DomainError(
                "CONTINUATION_CHAIN_VISIBILITY",
                "这一串的阅读范围要一起改，请在文稿信息里操作。",
                409,
            )
        return
    if _active_link(post.id) is None:
        return
    if "collection_id" in data and data["collection_id"] != post.collection_id:
        raise DomainError("CONTINUATION_SCOPE_LOCKED", "接着写的内容固定和原帖在同一个地方。", 409)
    if (
        post.collection_id is None
        and data.get("visibility") == PostVisibility.PRIVATE.value
        and _open_to_all(_published_chain_members(post))
    ):
        data["visibility"] = PostVisibility.LOGIN_ONLY.value


def _set_visibility(post, visibility):
    if post.visibility == visibility:
        return False
    from app.posts.revisions import create_revision, snapshot_post

    before = snapshot_post(post) if post.was_published else None
    source_edit_version = post.edit_version
    post.visibility = visibility
    if before is not None:
        create_revision(post, before, ["visibility"], source_edit_version=source_edit_version)
    return True


def _chain_label(post):
    return {"id": post.id, "post_type": post.post_type, "title": post.title}


def prepare_continuation_publish(post, *, confirm_widen=False):
    """首次发布时取并集；调用方已按 ID 升序锁住这一串的帖子。"""
    if post.was_published or _active_link(post.id) is None or post.collection_id is not None:
        return
    members = [item for item in _published_chain_members(post) if item.collection_id is None]
    if _open_to_all(members):
        post.visibility = PostVisibility.LOGIN_ONLY.value
        return
    if post.visibility != PostVisibility.LOGIN_ONLY.value or not members:
        return
    if confirm_widen is not True:
        raise DomainError(
            "CONTINUATION_WIDEN_CONFIRM",
            "发布后这一串都会变成所有映墨成员可读，请在写作页确认后再发布。",
            409,
            details={"posts": [_chain_label(item) for item in members]},
        )
    for item in members:
        _set_visibility(item, PostVisibility.LOGIN_ONLY.value)


def set_chain_visibility(post, actor_id, visibility):
    """整串一起改读者范围；调用方已按 ID 升序锁住这一串的帖子。"""
    if visibility not in {PostVisibility.LOGIN_ONLY.value, PostVisibility.PRIVATE.value}:
        raise DomainError("VALIDATION_ERROR", "visibility 仅支持 login_only/private。", 422)
    if post.collection_id is not None:
        raise DomainError("VALIDATION_ERROR", "合集内容由合集成员阅读，不能单独设置范围。", 422)
    ids = chain_post_ids(post.id)
    if len(ids) < 2:
        raise DomainError("VALIDATION_ERROR", "这篇内容不在一串记录里。", 422)
    members = db.session.scalars(
        db.select(Post).where(Post.id.in_(ids), Post.deleted_at.is_(None)).order_by(Post.id.asc())
    ).all()
    if any(item.author_id != actor_id or item.collection_id is not None for item in members):
        raise DomainError("CONTINUATION_CHAIN_MIXED", "这一串里有无法一起修改的内容。", 409)
    return sum(1 for item in members if _set_visibility(item, visibility))


def break_links_for_post(post_id, reason):
    """帖子换了合集：它和前后的关系都断开，留下的帖子互不影响。"""
    now = utcnow()
    for column in (PostContinuation.post_id, PostContinuation.source_post_id):
        links = db.session.scalars(
            db.select(PostContinuation)
            .where(column == post_id, PostContinuation.broken_at.is_(None))
            .order_by(PostContinuation.id.asc())
            .with_for_update()
        ).all()
        for link in links:
            link.broken_at = now
            link.broken_reason = reason


def discard_draft_link(post_id):
    db.session.execute(db.delete(PostContinuation).where(PostContinuation.post_id == post_id))
