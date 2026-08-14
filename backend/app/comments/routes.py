from datetime import datetime, timezone

from flask import Blueprint, current_app, request
from flask_jwt_extended import jwt_required
from sqlalchemy import func

from app.access import can_read_post
from app.common.auth import current_user
from app.common.pagination import pagination_meta, parse_pagination
from app.common.responses import error_response, success_response
from app.common.time import isoformat_utc
from app.extensions import db, limiter
from app.models import Comment, Notification, Post

bp = Blueprint("comments", __name__)


def utcnow():
    return datetime.now(timezone.utc)


def _comment_dict(comment, actor_id):
    return {
        "id": comment.id,
        "post_id": comment.post_id,
        "author": comment.author.public_dict() if comment.author else None,
        "body": "[该评论已删除]" if comment.status == "deleted" else comment.body,
        "status": comment.status,
        "parent_id": comment.parent_id,
        "reply_to_comment_id": comment.reply_to_comment_id,
        "reply_to_user": comment.reply_to_user.public_dict() if comment.reply_to_user else None,
        "can_delete": comment.author_id == actor_id,
        "created_at": isoformat_utc(comment.created_at),
    }


@bp.get("")
@jwt_required(locations=["headers"])
def list_comments():
    actor = current_user()
    args = parse_pagination()
    post_id = request.args.get("post_id", type=int)
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    post = db.session.get(Post, post_id) if post_id else None
    if not can_read_post(actor.id, post):
        return error_response("RESOURCE_NOT_FOUND", "Post 不存在。", 404)
    if not args:
        return error_response("VALIDATION_ERROR", "分页参数不合法。", 422)
    page, size = args
    stmt = db.select(Comment).where(
        Comment.post_id == post.id,
        Comment.parent_id.is_(None),
        Comment.status.in_(("active", "deleted")),
    )
    total = db.session.scalar(db.select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    roots = db.session.scalars(
        stmt.order_by(Comment.created_at.asc(), Comment.id.asc()).offset((page-1)*size).limit(size)
    ).all()
    root_ids=[root.id for root in roots]
    all_replies=db.session.scalars(
        db.select(Comment).where(
            Comment.parent_id.in_(root_ids),
            Comment.status.in_(("active","deleted")),
        ).order_by(Comment.created_at.asc(),Comment.id.asc())
    ).all() if root_ids else []
    replies_by_root={root_id:[] for root_id in root_ids}
    for reply in all_replies:
        replies_by_root[reply.parent_id].append(reply)
    items=[]
    for root in roots:
        replies=replies_by_root[root.id]
        if root.status == "deleted" and not replies:
            continue
        data=_comment_dict(root,actor.id)
        data["replies"]=[_comment_dict(x,actor.id) for x in replies]
        items.append(data)
    return success_response(items,meta=pagination_meta(page,size,total))


@bp.post("")
@jwt_required(locations=["headers"])
@limiter.limit(lambda: current_app.config["RATE_LIMIT_COMMENT"])
def create_comment():
    actor=current_user()
    data=request.get_json(silent=True) or {}
    post_id=data.get("post_id")
    post=db.session.get(Post,post_id) if isinstance(post_id,int) else None
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    if not can_read_post(actor.id,post):
        return error_response("RESOURCE_NOT_FOUND","Post 不存在。",404)
    body=data.get("body")
    if not isinstance(body,str) or not 1 <= len(body.strip()) <= 500:
        return error_response("VALIDATION_ERROR","评论内容须为 1–500 个 Unicode 字符。",422)

    replied=None
    reply_id=data.get("reply_to_comment_id")
    if reply_id is not None:
        replied=db.session.get(Comment,reply_id) if isinstance(reply_id,int) else None
        if replied is None or replied.post_id != post.id or replied.status != "active":
            return error_response("VALIDATION_ERROR","回复目标不存在或不可回复。",422)

    comment=Comment(
        post_id=post.id,author_id=actor.id,body=body.strip(),
        parent_id=(replied.parent_id or replied.id) if replied else None,
        reply_to_comment_id=replied.id if replied else None,
        reply_to_user_id=replied.author_id if replied else None,
    )
    db.session.add(comment)
    db.session.flush()

    recipient = replied.author_id if replied else post.author_id
    if recipient != actor.id:
        db.session.add(Notification(
            user_id=recipient,actor_id=actor.id,
            kind="comment_reply" if replied else "post_comment",
            target_type="post",
            post_id=post.id,comment_id=comment.id,
            message="有人回复了你的评论。" if replied else "有人评论了你的 Post。",
        ))
    db.session.commit()
    return success_response(_comment_dict(comment,actor.id),201)


@bp.delete("/<int:comment_id>")
@jwt_required(locations=["headers"])
def delete_comment(comment_id):
    actor=current_user()
    comment=db.session.get(Comment,comment_id)
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    if comment is None or comment.author_id != actor.id:
        return error_response("RESOURCE_NOT_FOUND","评论不存在。",404)
    replies=db.session.scalar(db.select(func.count(Comment.id)).where(Comment.parent_id==comment.id)) or 0
    if replies:
        comment.body=None
        comment.status="deleted"
        comment.deleted_at=utcnow()
    else:
        db.session.delete(comment)
    db.session.commit()
    return success_response(None)
