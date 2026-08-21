from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import and_, case, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.exc import StaleDataError
from sqlalchemy.orm import aliased

from app.access import can_read_post, is_collection_member, readable_post_predicate, semantic_time_expression
from app.common.auth import current_user
from app.common.markdown import render_safe_markdown_document
from app.common.pagination import pagination_meta, parse_pagination
from app.common.responses import error_response, success_response
from app.common.validation import parse_iso_datetime, validate_external_url
from app.extensions import db
from app.models import (
    ArticleSlug, Category, Collection, Comment, ContentFavorite, ContentLike, Notification,
    Media, Post, PostReadEvent, PostRevision, PostStatus, PostType, PostVisibility, Tag, User, post_tags,
)
from app.posts.service import (
    DomainError, apply_category, apply_collection, apply_tags, current_article_slug,
    publish_post, update_article_slug,
)
from app.posts.browsing import estimate_reading_minutes, first_display_media, serialize_browse_post
from app.posts.revisions import (
    changed_snapshot_fields, create_revision, restore_revision_snapshot,
    revision_detail, snapshot_post,
)
from app.posts.related import related_articles

bp = Blueprint("posts", __name__)

READ_DEDUPE_MINUTES = 30


def utcnow():
    return datetime.now(timezone.utc)


def _empty_reading_stats():
    return {
        "views": 0,
        "unique_readers": 0,
        "views_7d": 0,
        "views_30d": 0,
    }


def _reading_stats_for_posts(post_ids, *, now=None):
    ids = list(dict.fromkeys(post_ids))
    result = {post_id: _empty_reading_stats() for post_id in ids}
    if not ids:
        return result

    current_time = now or utcnow()
    cutoff_7d = current_time - timedelta(days=7)
    cutoff_30d = current_time - timedelta(days=30)
    rows = db.session.execute(
        db.select(
            PostReadEvent.post_id,
            func.count(PostReadEvent.id).label("views"),
            func.count(func.distinct(PostReadEvent.reader_id)).label("unique_readers"),
            func.coalesce(
                func.sum(case((PostReadEvent.created_at >= cutoff_7d, 1), else_=0)),
                0,
            ).label("views_7d"),
            func.coalesce(
                func.sum(case((PostReadEvent.created_at >= cutoff_30d, 1), else_=0)),
                0,
            ).label("views_30d"),
        )
        .where(PostReadEvent.post_id.in_(ids))
        .group_by(PostReadEvent.post_id)
    ).all()

    for row in rows:
        result[row.post_id] = {
            "views": int(row.views or 0),
            "unique_readers": int(row.unique_readers or 0),
            "views_7d": int(row.views_7d or 0),
            "views_30d": int(row.views_30d or 0),
        }
    return result


def _serialize(post, include_body=True, *, actor_id=None, management=False):
    data = post.to_dict(include_body=include_body, include_inactive_taxonomy=management)
    if post.post_type == PostType.ARTICLE.value:
        data["slug"] = current_article_slug(post.id) or post.slug_candidate
    collection_visible = (
        post.collection
        and post.collection.deleted_at is None
        and (not management or (actor_id is not None and is_collection_member(actor_id, post.collection)))
    )
    if collection_visible:
        data["collection"] = {
            "id": post.collection.id,
            "name": post.collection.name,
            "slug": post.collection.slug,
        }
    else:
        data["collection"] = None
    if include_body:
        media = db.session.scalars(
            db.select(Media).where(
                Media.bound_type == "post",
                Media.bound_id == post.id,
                Media.status == "active",
                Media.deleted_at.is_(None),
            ).order_by(Media.created_at.asc(), Media.id.asc())
        ).all()
        data["bound_media"] = [
            item.to_dict(include_manage_paths=management) for item in media
        ]
        if data.get("cover_media") and management:
            data["cover_media"] = post.cover_media.to_dict(include_manage_paths=True)
        data["reading_minutes"] = (
            estimate_reading_minutes(post.body)
            if post.post_type == PostType.ARTICLE.value else None
        )
    return data


def _handle_domain(error):
    return error_response(error.code, error.message, error.status, details=error.details)


def _edit_conflict(post, expected_version=None):
    details = {
        "expected_version": expected_version,
        "current_version": post.edit_version,
        "updated_at": post.to_dict(include_body=False)["updated_at"],
    }
    return error_response(
        "EDIT_CONFLICT",
        "内容已在其他窗口更新，本地修改仍保留。请重新载入服务器版本后再继续编辑。",
        409,
        details=details,
    )


def _extract_expected_version(data, *, required=False):
    payload = dict(data)
    expected_version = payload.pop("expected_version", None)
    if expected_version is None and required:
        raise DomainError("VALIDATION_ERROR", "自动保存必须提供 expected_version。", 422)
    if expected_version is not None and (
        isinstance(expected_version, bool)
        or not isinstance(expected_version, int)
        or expected_version < 1
    ):
        raise DomainError("VALIDATION_ERROR", "expected_version 必须是正整数。", 422)
    return payload, expected_version


def _apply_versioned_patch(post, actor, data, *, require_version=False):
    payload, expected_version = _extract_expected_version(data, required=require_version)
    if expected_version is not None and expected_version != post.edit_version:
        return _edit_conflict(post, expected_version)
    if require_version and payload.get("collection_id") is not None:
        collection = db.session.get(Collection, payload["collection_id"])
        if collection is None or not is_collection_member(actor.id, collection):
            raise DomainError(
                "COLLECTION_UNAVAILABLE",
                "原 Collection 已不可用。请改为独立草稿或选择其他 Collection。",
                409,
            )
    source_edit_version = post.edit_version
    before = snapshot_post(post) if post.was_published else None
    try:
        _apply_patch(post, actor, payload)
        if before is not None:
            changed_fields = changed_snapshot_fields(before, snapshot_post(post))
            create_revision(
                post, before, changed_fields, reason="manual_edit",
                source_edit_version=source_edit_version,
            )
        # A relationship-only edit (for example Tags) must still advance the version.
        post.updated_at = utcnow()
        db.session.commit()
    except StaleDataError:
        post_id = post.id
        db.session.rollback()
        current = db.session.get(Post, post_id)
        if current is None:
            return error_response("RESOURCE_NOT_FOUND", "Post 不存在。", 404)
        return _edit_conflict(current, expected_version)
    return success_response(_serialize(post, actor_id=actor.id, management=True))


def _detail(post,actor):
    data=_serialize(post,actor_id=actor.id)
    data["canonical"]=(f"/articles/{current_article_slug(post.id)}" if post.post_type=="article" else f"/notes/{post.id}")
    data["interactions"]={
        "like_count":db.session.scalar(db.select(func.count(ContentLike.id)).where(ContentLike.post_id==post.id)) or 0,
        "comment_count":db.session.scalar(db.select(func.count(Comment.id)).where(Comment.post_id==post.id,Comment.status.in_(("active","deleted")))) or 0,
        "liked":db.session.scalar(db.select(ContentLike.id).where(ContentLike.post_id==post.id,ContentLike.user_id==actor.id)) is not None,
        "favorited":db.session.scalar(db.select(ContentFavorite.id).where(ContentFavorite.post_id==post.id,ContentFavorite.user_id==actor.id)) is not None,
    }
    data["previous"]=None; data["next"]=None; data["related"]=[]
    if post.post_type==PostType.ARTICLE.value and post.published_at is not None:
        base=(
            db.select(Post).where(
                readable_post_predicate(actor.id,include_archived=True),
                Post.post_type==PostType.ARTICLE.value,
                Post.author_id==post.author_id,
                Post.id!=post.id,
            )
        )
        previous=db.session.scalar(base.where(
            or_(Post.published_at<post.published_at,and_(Post.published_at==post.published_at,Post.id<post.id))
        ).order_by(Post.published_at.desc(),Post.id.desc()).limit(1))
        following=db.session.scalar(base.where(
            or_(Post.published_at>post.published_at,and_(Post.published_at==post.published_at,Post.id>post.id))
        ).order_by(Post.published_at.asc(),Post.id.asc()).limit(1))
        def nav(item):
            return {"id":item.id,"title":item.title,"slug":current_article_slug(item.id)} if item else None
        data["previous"]=nav(previous); data["next"]=nav(following)
        data["related"] = related_articles(post, actor.id)
    return data


def _apply_patch(post, actor, data):
    allowed = {
        "post_type", "title", "summary", "body", "content_format", "cover_media_id",
        "category_id", "tag_names", "collection_id", "visibility", "occurred_at",
        "location", "mood", "external_video_url", "slug",
    }
    unknown = sorted(set(data) - allowed)
    if unknown:
        raise DomainError("VALIDATION_ERROR", "包含不支持的字段。", 422, [{"fields": unknown}])

    if "post_type" in data:
        value = data["post_type"]
        if value not in {PostType.ARTICLE.value, PostType.NOTE.value}:
            raise DomainError("VALIDATION_ERROR", "post_type 必须是 article 或 note。", 422)
        if post.was_published and value != post.post_type:
            raise DomainError("VALIDATION_ERROR", "Post 第一次发布后不能改变类型。", 422)
        post.post_type = value
        if value == PostType.NOTE.value:
            post.category = None
        else:
            post.occurred_at = None
            post.location = None
            post.mood = None

    for key, max_len in (("title", 240), ("summary", 500), ("location", 255), ("mood", 100)):
        if key in data:
            if key in {"location", "mood"} and post.post_type != PostType.NOTE.value:
                raise DomainError("VALIDATION_ERROR", f"{key} 仅 Note 支持。", 422)
            value = data[key]
            if value is not None and (not isinstance(value, str) or len(value) > max_len):
                raise DomainError("VALIDATION_ERROR", f"{key} 字段不合法。", 422)
            setattr(post, key, value.strip() if isinstance(value, str) else None)

    if "body" in data:
        if data["body"] is not None and not isinstance(data["body"], str):
            raise DomainError("VALIDATION_ERROR", "body 必须是字符串或 null。", 422)
        post.body = data["body"]

    if "content_format" in data:
        if data["content_format"] not in {"markdown", "plain"}:
            raise DomainError("VALIDATION_ERROR", "content_format 不合法。", 422)
        post.content_format = data["content_format"]

    if "occurred_at" in data:
        if post.post_type != PostType.NOTE.value:
            raise DomainError("VALIDATION_ERROR", "occurred_at 仅 Note 支持。", 422)
        try:
            post.occurred_at = parse_iso_datetime(data["occurred_at"])
        except ValueError:
            raise DomainError("VALIDATION_ERROR", "occurred_at 不是合法 ISO 8601 时间。", 422)

    if "external_video_url" in data:
        try:
            post.external_video_url = validate_external_url(data["external_video_url"])
        except ValueError:
            raise DomainError("VALIDATION_ERROR", "external_video_url 不合法。", 422)

    if "visibility" in data:
        visibility = data["visibility"]
        if visibility not in {PostVisibility.LOGIN_ONLY.value, PostVisibility.PRIVATE.value}:
            raise DomainError("VALIDATION_ERROR", "visibility 仅支持 login_only/private。", 422)
        if post.collection_id is None:
            post.visibility = visibility

    if "collection_id" in data:
        apply_collection(post, actor.id, data["collection_id"])

    if "category_id" in data:
        apply_category(post, data["category_id"])

    if "tag_names" in data:
        apply_tags(post, data["tag_names"])

    if "cover_media_id" in data:
        cover_id = data["cover_media_id"]
        if cover_id is not None and (isinstance(cover_id, bool) or not isinstance(cover_id, int)):
            raise DomainError("VALIDATION_ERROR", "cover_media_id 不合法。", 422)
        if cover_id is not None:
            from app.models import Media
            media = db.session.get(Media, cover_id)
            if media is None or media.owner_id != actor.id or media.kind != "image" or (
                media.bound_type is not None
                and (media.bound_type != "post" or media.bound_id != post.id)
            ):
                raise DomainError("RESOURCE_NOT_FOUND", "封面媒体不存在。", 404)
            media.bound_type = "post"
            media.bound_id = post.id
        post.cover_media_id = cover_id

    if "slug" in data and post.was_published:
        update_article_slug(post, actor.id, data["slug"])
    elif "slug" in data:
        slug = data["slug"]
        from app.common.validation import SLUG_RE
        normalized = slug.strip().lower() if isinstance(slug, str) else ""
        if normalized and not SLUG_RE.fullmatch(normalized):
            raise DomainError("VALIDATION_ERROR", "Article Slug 格式不合法。", 422)
        post.slug_candidate = normalized or None


@bp.post("/preview")
@jwt_required(locations=["headers"])
def preview_markdown():
    actor = current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error_response("VALIDATION_ERROR", "请求体必须是 JSON 对象。", 422)
    body = data.get("body", "")
    if body is None:
        body = ""
    if not isinstance(body, str):
        return error_response("VALIDATION_ERROR", "body 必须是字符串或 null。", 422)
    markdown_document = render_safe_markdown_document(body)
    return success_response({
        "rendered_html": markdown_document["html"],
        "outline": markdown_document["outline"],
    })


@bp.get("")
@jwt_required(locations=["headers"])
def list_posts():
    actor = current_user()
    args = parse_pagination()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    if not args:
        return error_response("VALIDATION_ERROR", "分页参数不合法。", 422)
    page, size = args

    stmt = db.select(Post).where(readable_post_predicate(actor.id, include_archived=True))
    post_type = request.args.get("post_type")
    if post_type:
        if post_type not in {PostType.ARTICLE.value, PostType.NOTE.value}:
            return error_response("VALIDATION_ERROR", "post_type 不合法。", 422)
        stmt = stmt.where(Post.post_type == post_type)
    author = request.args.get("author")
    if author:
        if author.isdigit():
            stmt = stmt.where(Post.author_id == int(author))
        else:
            stmt = stmt.join(User, User.id == Post.author_id).where(User.username_normalized == author.lower())
    collection = request.args.get("collection")
    if collection:
        collection_filter = aliased(Collection)
        if collection.isdigit():
            stmt = stmt.where(Post.collection_id == int(collection))
        else:
            stmt = stmt.join(collection_filter, collection_filter.id == Post.collection_id).where(
                collection_filter.slug == collection
            )
    category = request.args.get("category")
    if category:
        if category.isdigit():
            stmt = stmt.where(Post.category_id == int(category))
        else:
            stmt = stmt.join(Category, Category.id == Post.category_id).where(Category.slug == category)
    tag = request.args.get("tag")
    if tag:
        stmt = stmt.join(post_tags, post_tags.c.post_id == Post.id).join(Tag, Tag.id == post_tags.c.tag_id)
        stmt = stmt.where(Tag.id == int(tag)) if tag.isdigit() else stmt.where(Tag.slug == tag)

    sort = request.args.get("sort", "newest")
    time_expr = semantic_time_expression()
    if sort == "oldest":
        order = (time_expr.asc(), Post.id.asc())
    elif sort == "updated":
        order = (Post.updated_at.desc(), Post.id.desc())
    elif sort == "newest":
        order = (time_expr.desc(), Post.id.desc())
    else:
        return error_response("VALIDATION_ERROR", "sort 不合法。", 422)

    total = db.session.scalar(db.select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.session.scalars(
        stmt.order_by(*order)
        .offset((page - 1) * size).limit(size)
    ).all()
    display_media = first_display_media(rows)
    return success_response(
        [serialize_browse_post(p, actor_id=actor.id, display_media=display_media) for p in rows],
        meta=pagination_meta(page, size, total),
    )


@bp.get("/filter-options")
@jwt_required(locations=["headers"])
def filter_options():
    actor = current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    post_type = request.args.get("post_type")
    if post_type is not None and post_type not in {PostType.ARTICLE.value, PostType.NOTE.value}:
        return error_response("VALIDATION_ERROR", "post_type 不合法。", 422)

    scope_filters = [readable_post_predicate(actor.id, include_archived=True)]
    if post_type is not None:
        scope_filters.append(Post.post_type == post_type)
    scope = db.select(Post.id).where(*scope_filters).subquery()
    authors = db.session.scalars(
        db.select(User).join(Post, Post.author_id == User.id).join(scope, scope.c.id == Post.id)
        .distinct().order_by(User.nickname.asc(), User.id.asc())
    ).all()
    collections = db.session.scalars(
        db.select(Collection).join(Post, Post.collection_id == Collection.id).join(scope, scope.c.id == Post.id)
        .distinct().order_by(Collection.name.asc(), Collection.id.asc())
    ).all()
    tags = db.session.scalars(
        db.select(Tag).join(post_tags, post_tags.c.tag_id == Tag.id)
        .join(scope, scope.c.id == post_tags.c.post_id)
        .where(Tag.is_active.is_(True)).distinct().order_by(Tag.name.asc(), Tag.id.asc())
    ).all()
    categories = []
    if post_type != PostType.NOTE.value:
        categories = db.session.scalars(
            db.select(Category).join(Post, Post.category_id == Category.id).join(scope, scope.c.id == Post.id)
            .where(Category.is_active.is_(True)).distinct()
            .order_by(Category.sort_order.asc(), Category.name.asc(), Category.id.asc())
        ).all()
    return success_response({
        "authors": [user.public_dict() for user in authors],
        "categories": [category.to_dict() for category in categories],
        "tags": [tag.to_dict() for tag in tags],
        "collections": [
            {"id": collection.id, "name": collection.name, "slug": collection.slug}
            for collection in collections
        ],
    })


@bp.get("/<int:post_id>")
@jwt_required(locations=["headers"])
def get_post(post_id):
    actor = current_user()
    post = db.session.get(Post, post_id)
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    if not can_read_post(actor.id, post, include_archived=True):
        return error_response("RESOURCE_NOT_FOUND", "Post 不存在。", 404)
    return success_response(_detail(post,actor))


@bp.get("/slug/<slug>")
@jwt_required(locations=["headers"])
def get_by_slug(slug):
    actor = current_user()
    row = db.session.scalar(db.select(ArticleSlug).where(ArticleSlug.slug == slug))
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    if row is None or not can_read_post(actor.id, row.post, include_archived=True):
        return error_response("RESOURCE_NOT_FOUND", "Article 不存在。", 404)
    current = current_article_slug(row.post_id)
    if current != slug:
        response, status = success_response({
            "redirect": True,
            "canonical": f"/articles/{current}",
            "post_id": row.post_id,
        }, 301)
        response.headers["Location"] = f"/articles/{current}"
        return response, status
    return success_response(_detail(row.post,actor))


@bp.post("/<int:post_id>/read")
@jwt_required(locations=["headers"])
def record_read(post_id):
    actor = current_user()
    post = db.session.get(Post, post_id)
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    if not can_read_post(actor.id, post, include_archived=True):
        return error_response("RESOURCE_NOT_FOUND", "Post 不存在。", 404)
    if post.author_id == actor.id:
        return success_response({"recorded": False})

    now = utcnow()
    recent = db.session.scalar(
        db.select(PostReadEvent.id)
        .where(
            PostReadEvent.post_id == post.id,
            PostReadEvent.reader_id == actor.id,
            PostReadEvent.created_at >= now - timedelta(minutes=READ_DEDUPE_MINUTES),
        )
        .limit(1)
    )
    if recent is not None:
        return success_response({"recorded": False})

    bucket_start = now.replace(
        minute=(now.minute // READ_DEDUPE_MINUTES) * READ_DEDUPE_MINUTES,
        second=0,
        microsecond=0,
    )
    db.session.add(PostReadEvent(
        post_id=post.id,
        reader_id=actor.id,
        bucket_start=bucket_start,
        created_at=now,
    ))
    try:
        db.session.commit()
    except IntegrityError:
        # The unique bucket constraint makes concurrent duplicate read attempts harmless.
        db.session.rollback()
        return success_response({"recorded": False})
    return success_response({"recorded": True})


@bp.get("/<int:post_id>/reading-stats")
@jwt_required(locations=["headers"])
def reading_stats(post_id):
    actor = current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    post = db.session.get(Post, post_id)
    if post is None or post.author_id != actor.id or post.deleted_at is not None:
        return error_response("RESOURCE_NOT_FOUND", "Post 不存在。", 404)
    stats = _reading_stats_for_posts([post.id])[post.id]
    return success_response({"post_id": post.id, **stats})


@bp.post("")
@jwt_required(locations=["headers"])
def create_post():
    actor = current_user()
    data = request.get_json(silent=True) or {}
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    post_type = data.get("post_type", PostType.ARTICLE.value)
    if post_type not in {PostType.ARTICLE.value, PostType.NOTE.value}:
        return error_response("VALIDATION_ERROR", "post_type 必须是 article 或 note。", 422)
    post = Post(author_id=actor.id, post_type=post_type, status=PostStatus.DRAFT.value, visibility=PostVisibility.PRIVATE.value)
    db.session.add(post)
    db.session.flush()
    try:
        _apply_patch(post, actor, data)
        db.session.commit()
    except DomainError as error:
        db.session.rollback()
        return _handle_domain(error)
    return success_response(_serialize(post, actor_id=actor.id, management=True), 201)


@bp.patch("/<int:post_id>")
@jwt_required(locations=["headers"])
def update_post(post_id):
    actor = current_user()
    post = db.session.get(Post, post_id)
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    if post is None or post.author_id != actor.id or post.deleted_at is not None:
        return error_response("RESOURCE_NOT_FOUND", "Post 不存在。", 404)
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error_response("VALIDATION_ERROR", "请求体必须是 JSON 对象。", 422)
    try:
        return _apply_versioned_patch(post, actor, data)
    except (DomainError, IntegrityError) as error:
        db.session.rollback()
        if isinstance(error, IntegrityError):
            return error_response("DUPLICATE_RESOURCE", "资源与现有数据冲突。", 409)
        return _handle_domain(error)


@bp.patch("/<int:post_id>/autosave")
@jwt_required(locations=["headers"])
def autosave_post(post_id):
    actor = current_user()
    post = db.session.get(Post, post_id)
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    if post is None or post.author_id != actor.id or post.deleted_at is not None:
        return error_response("RESOURCE_NOT_FOUND", "Post 不存在。", 404)
    if post.status != PostStatus.DRAFT.value:
        return error_response("AUTOSAVE_NOT_ALLOWED", "自动保存仅适用于草稿；已发布内容请手动保存。", 409)
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error_response("VALIDATION_ERROR", "请求体必须是 JSON 对象。", 422)
    try:
        return _apply_versioned_patch(post, actor, data, require_version=True)
    except (DomainError, IntegrityError) as error:
        db.session.rollback()
        if isinstance(error, IntegrityError):
            return error_response("DUPLICATE_RESOURCE", "资源与现有数据冲突。", 409)
        return _handle_domain(error)


@bp.post("/<int:post_id>/publish")
@jwt_required(locations=["headers"])
def publish(post_id):
    actor = current_user()
    post = db.session.get(Post, post_id)
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    if post is None or post.author_id != actor.id or post.deleted_at is not None:
        return error_response("RESOURCE_NOT_FOUND", "Post 不存在。", 404)
    data = request.get_json(silent=True) or {}
    try:
        slug = publish_post(post, actor.id, data.get("slug"))
        db.session.commit()
    except (DomainError, IntegrityError) as error:
        db.session.rollback()
        if isinstance(error, IntegrityError):
            return error_response("DUPLICATE_RESOURCE", "该 Article Slug 已被占用。", 409)
        return _handle_domain(error)
    return success_response(_serialize(post, actor_id=actor.id, management=True))


@bp.post("/<int:post_id>/archive")
@jwt_required(locations=["headers"])
def archive(post_id):
    actor = current_user()
    post = db.session.get(Post, post_id)
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    if post is None or post.author_id != actor.id or post.deleted_at is not None:
        return error_response("RESOURCE_NOT_FOUND", "Post 不存在。", 404)
    if post.status != PostStatus.PUBLISHED.value:
        return error_response("VALIDATION_ERROR", "只有 published Post 可以归档。", 422)
    post.status = PostStatus.ARCHIVED.value
    db.session.commit()
    return success_response(_serialize(post, actor_id=actor.id, management=True))


@bp.post("/<int:post_id>/move-collection")
@jwt_required(locations=["headers"])
def move_collection(post_id):
    actor = current_user()
    post = db.session.get(Post, post_id)
    data = request.get_json(silent=True) or {}
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    if post is None or post.author_id != actor.id or post.deleted_at is not None:
        return error_response("RESOURCE_NOT_FOUND", "Post 不存在。", 404)
    if "collection_id" not in data:
        return error_response("VALIDATION_ERROR", "collection_id 为必填项。", 422)
    try:
        source_edit_version = post.edit_version
        before = snapshot_post(post) if post.was_published else None
        apply_collection(post, actor.id, data["collection_id"])
        if before is not None:
            create_revision(
                post, before, changed_snapshot_fields(before, snapshot_post(post)),
                reason="collection_change", source_edit_version=source_edit_version,
            )
        post.updated_at = utcnow()
        db.session.commit()
    except DomainError as error:
        db.session.rollback()
        return _handle_domain(error)
    return success_response(_serialize(post, actor_id=actor.id, management=True))


@bp.post("/<int:post_id>/remove-from-collection")
@jwt_required(locations=["headers"])
def remove_from_collection(post_id):
    actor = current_user()
    post = db.session.get(Post, post_id)
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    if post is None or post.author_id != actor.id or post.deleted_at is not None:
        return error_response("RESOURCE_NOT_FOUND", "Post 不存在。", 404)
    source_edit_version = post.edit_version
    before = snapshot_post(post) if post.was_published else None
    post.collection_id = None
    post.collection_sort_order = None
    post.visibility = PostVisibility.PRIVATE.value
    if before is not None:
        create_revision(
            post, before, changed_snapshot_fields(before, snapshot_post(post)),
            reason="collection_change", source_edit_version=source_edit_version,
        )
    post.updated_at = utcnow()
    db.session.commit()
    return success_response(_serialize(post, actor_id=actor.id, management=True))


@bp.delete("/<int:post_id>")
@jwt_required(locations=["headers"])
def delete_post(post_id):
    actor = current_user()
    post = db.session.get(Post, post_id)
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    if post is None or post.author_id != actor.id or post.deleted_at is not None:
        return error_response("RESOURCE_NOT_FOUND", "Post 不存在。", 404)
    if not post.was_published:
        db.session.delete(post)
    else:
        post.deleted_at = utcnow()
    db.session.commit()
    return success_response(None)


@bp.get("/me")
@jwt_required(locations=["headers"])
def my_posts():
    actor = current_user()
    args = parse_pagination()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    if not args:
        return error_response("VALIDATION_ERROR", "分页参数不合法。", 422)
    page, size = args
    stmt = db.select(Post).where(Post.author_id == actor.id, Post.deleted_at.is_(None))
    status = request.args.get("status")
    if status:
        if status not in {PostStatus.DRAFT.value,PostStatus.PUBLISHED.value,PostStatus.ARCHIVED.value}:
            return error_response("VALIDATION_ERROR","status 不合法。",422)
        stmt = stmt.where(Post.status == status)
    post_type=request.args.get("post_type")
    if post_type:
        if post_type not in {PostType.ARTICLE.value,PostType.NOTE.value}:
            return error_response("VALIDATION_ERROR","post_type 不合法。",422)
        stmt=stmt.where(Post.post_type==post_type)
    q=(request.args.get("q") or "").strip()
    if q:
        if len(q)>100:
            return error_response("VALIDATION_ERROR","q 长度不得超过 100。",422)
        like=f"%{q}%"; stmt=stmt.where(or_(Post.title.ilike(like),Post.summary.ilike(like),Post.body.ilike(like)))
    total = db.session.scalar(db.select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.session.scalars(
        stmt.order_by(Post.updated_at.desc(), Post.id.desc()).offset((page - 1) * size).limit(size)
    ).all()
    stats_by_post = _reading_stats_for_posts([p.id for p in rows])
    # 作者管理例外：只返回自己的 Post，不展开无权 Collection 的敏感上下文。
    result = []
    for p in rows:
        item = p.to_dict(include_body=False, include_inactive_taxonomy=True)
        item["slug"] = current_article_slug(p.id) if p.post_type == PostType.ARTICLE.value else None
        item["collection_id"] = p.collection_id
        if item.get("cover_media"):
            item["cover_media"] = p.cover_media.to_dict(include_manage_paths=True)
        item.pop("collection", None)
        item["reading_stats"] = stats_by_post[p.id]
        result.append(item)
    return success_response(result, meta=pagination_meta(page, size, total))


@bp.get("/me/<int:post_id>")
@jwt_required(locations=["headers"])
def my_post_detail(post_id):
    actor=current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    post=db.session.get(Post,post_id)
    if post is None or post.author_id!=actor.id or post.deleted_at is not None:
        return error_response("RESOURCE_NOT_FOUND","Post 不存在。",404)
    return success_response(_serialize(post,actor_id=actor.id,management=True))


@bp.get("/me/<int:post_id>/revisions")
@jwt_required(locations=["headers"])
def my_post_revisions(post_id):
    actor = current_user()
    post = db.session.get(Post, post_id)
    args = parse_pagination(default_size=20, max_size=50)
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    if post is None or post.author_id != actor.id or post.deleted_at is not None:
        return error_response("RESOURCE_NOT_FOUND", "Post 不存在。", 404)
    if not args:
        return error_response("VALIDATION_ERROR", "分页参数不合法。", 422)
    page, size = args
    stmt = db.select(PostRevision).where(PostRevision.post_id == post.id)
    total = db.session.scalar(db.select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.session.scalars(
        stmt.order_by(PostRevision.created_at.desc(), PostRevision.id.desc())
        .offset((page - 1) * size).limit(size)
    ).all()
    return success_response(
        [revision.summary_dict() for revision in rows],
        meta=pagination_meta(page, size, total),
    )


@bp.get("/me/<int:post_id>/revisions/<int:revision_id>")
@jwt_required(locations=["headers"])
def my_post_revision_detail(post_id, revision_id):
    actor = current_user()
    post = db.session.get(Post, post_id)
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    if post is None or post.author_id != actor.id or post.deleted_at is not None:
        return error_response("RESOURCE_NOT_FOUND", "Post 不存在。", 404)
    revision = db.session.get(PostRevision, revision_id)
    if revision is None or revision.post_id != post.id:
        return error_response("RESOURCE_NOT_FOUND", "历史版本不存在。", 404)
    return success_response(revision_detail(revision, actor.id))


@bp.post("/me/<int:post_id>/revisions/<int:revision_id>/restore")
@jwt_required(locations=["headers"])
def restore_post_revision(post_id, revision_id):
    actor = current_user()
    post = db.session.get(Post, post_id)
    data = request.get_json(silent=True)
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    if post is None or post.author_id != actor.id or post.deleted_at is not None:
        return error_response("RESOURCE_NOT_FOUND", "Post 不存在。", 404)
    revision = db.session.get(PostRevision, revision_id)
    if revision is None or revision.post_id != post.id:
        return error_response("RESOURCE_NOT_FOUND", "历史版本不存在。", 404)
    if not isinstance(data, dict):
        return error_response("VALIDATION_ERROR", "请求体必须是 JSON 对象。", 422)
    try:
        payload, expected_version = _extract_expected_version(data, required=True)
        if payload:
            raise DomainError("VALIDATION_ERROR", "恢复操作仅接受 expected_version。", 422)
        if expected_version != post.edit_version:
            return _edit_conflict(post, expected_version)
        source_edit_version = post.edit_version
        before = snapshot_post(post)
        warnings = restore_revision_snapshot(post, revision, actor)
        changed_fields = changed_snapshot_fields(before, snapshot_post(post))
        if not changed_fields:
            db.session.rollback()
            return error_response("REVISION_NO_CHANGES", "当前内容已经与该历史版本一致。", 409)
        create_revision(
            post, before, changed_fields, reason="restore",
            source_edit_version=source_edit_version,
        )
        post.updated_at = utcnow()
        db.session.commit()
    except (DomainError, IntegrityError, StaleDataError) as error:
        db.session.rollback()
        if isinstance(error, StaleDataError):
            current = db.session.get(Post, post_id)
            return _edit_conflict(current, data.get("expected_version"))
        if isinstance(error, IntegrityError):
            return error_response("EDIT_CONFLICT", "内容版本已经变化，请重新载入后再恢复。", 409)
        return _handle_domain(error)
    return success_response({
        "post": _serialize(post, actor_id=actor.id, management=True),
        "warnings": warnings,
    })
