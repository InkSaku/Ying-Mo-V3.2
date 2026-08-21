from flask import Blueprint, request
from flask_jwt_extended import jwt_required
from sqlalchemy import extract, func
from sqlalchemy.orm import aliased

from app.access import readable_post_predicate, semantic_time_expression
from app.common.auth import current_user
from app.common.pagination import pagination_meta, parse_pagination
from app.common.responses import error_response, success_response
from app.extensions import db
from app.models import Category, Collection, Post, Tag, User, post_tags
from app.posts.browsing import first_display_media, serialize_browse_post

bp = Blueprint("archive", __name__)


def _scoped_statement(actor_id):
    stmt = db.select(Post).where(readable_post_predicate(actor_id, include_archived=True))
    author = request.args.get("author")
    if author:
        stmt = stmt.join(User, User.id == Post.author_id)
        stmt = stmt.where(User.id == int(author)) if author.isdigit() else stmt.where(
            User.username_normalized == author.lower()
        )
    category = request.args.get("category")
    if category:
        stmt = stmt.join(Category, Category.id == Post.category_id)
        stmt = stmt.where(Category.id == int(category)) if category.isdigit() else stmt.where(Category.slug == category)
    tag = request.args.get("tag")
    if tag:
        stmt = stmt.join(post_tags, post_tags.c.post_id == Post.id).join(Tag, Tag.id == post_tags.c.tag_id)
        stmt = stmt.where(Tag.id == int(tag)) if tag.isdigit() else stmt.where(Tag.slug == tag)
    collection = request.args.get("collection")
    if collection:
        collection_filter = aliased(Collection)
        stmt = stmt.join(collection_filter, collection_filter.id == Post.collection_id)
        stmt = stmt.where(collection_filter.id == int(collection)) if collection.isdigit() else stmt.where(
            collection_filter.slug == collection
        )
    return stmt


def _archive_response(actor_id, year=None, month=None):
    args = parse_pagination(default_size=30)
    if not args:
        return error_response("VALIDATION_ERROR", "分页参数不合法。", 422)
    if month is not None and not 1 <= month <= 12:
        return error_response("VALIDATION_ERROR", "month 不合法。", 422)
    page, size = args
    time_expr = semantic_time_expression()
    stmt = _scoped_statement(actor_id)
    if year is not None:
        stmt = stmt.where(extract("year", time_expr) == year)
    if month is not None:
        stmt = stmt.where(extract("month", time_expr) == month)
    total = db.session.scalar(db.select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.session.scalars(
        stmt.order_by(time_expr.desc(), Post.id.desc()).offset((page - 1) * size).limit(size)
    ).all()
    display_media = first_display_media(rows)

    facet_base = _scoped_statement(actor_id).with_only_columns(
        extract("year", time_expr).label("year"),
        extract("month", time_expr).label("month"),
        func.count(Post.id).label("count"),
    ).group_by(extract("year", time_expr), extract("month", time_expr)).order_by(
        extract("year", time_expr).desc(), extract("month", time_expr).desc()
    )
    facets = [
        {"year": int(row.year), "month": int(row.month), "count": row.count}
        for row in db.session.execute(facet_base)
        if row.year is not None and row.month is not None
    ]
    return success_response(
        {"items": [serialize_browse_post(post, actor_id=actor_id, display_media=display_media) for post in rows], "month_facets": facets},
        meta=pagination_meta(page, size, total),
    )


@bp.get("")
@jwt_required(locations=["headers"])
def archive():
    actor = current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    return _archive_response(actor.id)


@bp.get("/<int:year>")
@jwt_required(locations=["headers"])
def archive_year(year):
    actor = current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    return _archive_response(actor.id, year=year)


@bp.get("/<int:year>/<int:month>")
@jwt_required(locations=["headers"])
def archive_month(year, month):
    actor = current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    return _archive_response(actor.id, year=year, month=month)
