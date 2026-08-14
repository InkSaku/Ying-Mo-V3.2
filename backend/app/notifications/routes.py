from flask import Blueprint
from flask_jwt_extended import jwt_required
from sqlalchemy import func, update

from app.access import can_read_post, is_collection_member
from app.common.auth import current_user
from app.common.pagination import pagination_meta, parse_pagination
from app.common.responses import error_response, success_response
from app.extensions import db
from app.models import Collection, Notification, Post
from app.posts.service import current_article_slug

bp=Blueprint("notifications",__name__)


def _safe_notification(item,actor,posts,collections):
    data=item.to_dict()
    data["target_url"]=None
    if item.post_id is not None:
        post=posts.get(item.post_id)
        if post is not None and can_read_post(actor.id,post,include_archived=True):
            data["target_url"]=(
                f"/articles/{current_article_slug(post.id)}" if post.post_type=="article" else f"/notes/{post.id}"
            )
        elif post is not None and post.author_id==actor.id and item.kind=="post_removed_from_collection":
            data["target_url"]=f"/write/{post.id}"
        else:
            data["post_id"]=None
    if item.collection_id is not None:
        collection=collections.get(item.collection_id)
        if collection is not None and is_collection_member(actor.id,collection):
            if data["target_url"] is None:
                data["target_url"]=f"/collections/{collection.slug}"
        else:
            data["collection_id"]=None
    return data


@bp.get("")
@jwt_required(locations=["headers"])
def list_notifications():
    actor=current_user(); args=parse_pagination()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    if not args:
        return error_response("VALIDATION_ERROR","分页参数不合法。",422)
    page,size=args
    stmt=db.select(Notification).where(Notification.user_id==actor.id)
    total=db.session.scalar(db.select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows=db.session.scalars(stmt.order_by(Notification.created_at.desc(),Notification.id.desc()).offset((page-1)*size).limit(size)).all()
    post_ids={row.post_id for row in rows if row.post_id is not None}
    collection_ids={row.collection_id for row in rows if row.collection_id is not None}
    posts={p.id:p for p in db.session.scalars(db.select(Post).where(Post.id.in_(post_ids))).all()} if post_ids else {}
    collections={c.id:c for c in db.session.scalars(db.select(Collection).where(Collection.id.in_(collection_ids))).all()} if collection_ids else {}
    return success_response([_safe_notification(n,actor,posts,collections) for n in rows],meta=pagination_meta(page,size,total))


@bp.post("/<int:notification_id>/read")
@jwt_required(locations=["headers"])
def mark_read(notification_id):
    actor=current_user()
    item=db.session.get(Notification,notification_id)
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    if item is None or item.user_id != actor.id:
        return error_response("RESOURCE_NOT_FOUND","通知不存在。",404)
    item.is_read=True
    db.session.commit()
    return success_response(item.to_dict())


@bp.post("/read-all")
@jwt_required(locations=["headers"])
def mark_all():
    actor=current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    db.session.execute(update(Notification).where(Notification.user_id==actor.id,Notification.is_read.is_(False)).values(is_read=True))
    db.session.commit()
    return success_response({"updated":True})
