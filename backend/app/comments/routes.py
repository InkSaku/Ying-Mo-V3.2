from datetime import datetime, timezone
from uuid import UUID

from flask import Blueprint, current_app, request
from flask_jwt_extended import jwt_required
from sqlalchemy import and_, exists, func, or_
from sqlalchemy.exc import IntegrityError

from app.access import can_read_post
from app.common.auth import current_user
from app.common.pagination import pagination_meta, parse_pagination
from app.common.responses import error_response, success_response
from app.common.time import isoformat_utc
from app.extensions import db, limiter
from app.interactions.service import reaction_summaries
from app.models import (
    CollectionMember, Comment, CommentMention, CommentReaction, Post, User, UserStatus,
)
from app.notifications.service import add_post_notification

bp = Blueprint("comments", __name__)


def utcnow():
    return datetime.now(timezone.utc)


def _comment_dict(comment, actor_id, *, quotes=None, mentions=None, reactions=None):
    quoted=(quotes or {}).get(comment.reply_to_comment_id)
    data={
        "id": comment.id,
        "post_id": comment.post_id,
        "author": comment.author.public_dict() if comment.author else None,
        "body": "[该评论已删除]" if comment.status == "deleted" else comment.body,
        "status": comment.status,
        "parent_id": comment.parent_id,
        "reply_to_comment_id": comment.reply_to_comment_id,
        "reply_to_user": comment.reply_to_user.public_dict() if comment.reply_to_user else None,
        "quoted_comment": (
            {
                "id": quoted.id,
                "author": quoted.author.public_dict() if quoted.author else None,
                "body": "[该评论已删除]" if quoted.status=="deleted" else quoted.body,
                "status": quoted.status,
            }
            if quoted is not None else None
        ),
        "mentions": [link.user.public_dict() for link in (mentions or {}).get(comment.id,[]) if link.user],
        "reactions": (reactions or {}).get(comment.id),
        "can_delete": comment.author_id == actor_id,
        "created_at": isoformat_utc(comment.created_at),
    }
    return data


def _comment_maps(comments, actor_id):
    comment_ids=[item.id for item in comments]
    quote_ids={item.reply_to_comment_id for item in comments if item.reply_to_comment_id is not None}
    quotes={item.id:item for item in db.session.scalars(db.select(Comment).where(
        Comment.id.in_(quote_ids),Comment.status.in_(("active","deleted")),
    )).all()} if quote_ids else {}
    mention_links=db.session.scalars(db.select(CommentMention).where(
        CommentMention.comment_id.in_(comment_ids),
    ).order_by(CommentMention.id.asc())).all() if comment_ids else []
    mentions={comment_id:[] for comment_id in comment_ids}
    for link in mention_links:
        mentions[link.comment_id].append(link)
    reactions=reaction_summaries(
        CommentReaction,CommentReaction.comment_id,comment_ids,actor_id=actor_id,
    )
    return quotes,mentions,reactions


def _single_comment_dict(comment, actor_id):
    quotes,mentions,reactions=_comment_maps([comment],actor_id)
    return _comment_dict(
        comment,actor_id,quotes=quotes,mentions=mentions,reactions=reactions,
    )


def _mentionable_predicate(post):
    active=User.status==UserStatus.ACTIVE.value
    if post.collection_id is not None:
        return and_(active,or_(
            User.id==post.collection.creator_id,
            exists().where(
                CollectionMember.collection_id==post.collection_id,
                CollectionMember.user_id==User.id,
            ),
        ))
    if post.visibility=="login_only":
        return active
    return and_(active,User.id==post.author_id)


def _parse_mention_ids(data):
    values=data.get("mention_user_ids",[])
    if not isinstance(values,list) or len(values)>10 or any(
        isinstance(value,bool) or not isinstance(value,int) or value<=0 for value in values
    ):
        return None
    unique=list(dict.fromkeys(values))
    return unique if len(unique)==len(values) else None


def _valid_client_request_id(value):
    if value is None:
        return None
    if not isinstance(value,str) or len(value)!=36:
        return False
    try:
        return str(UUID(value))==value.lower()
    except ValueError:
        return False


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
    visible_comments=[item for root in roots for item in [root,*replies_by_root[root.id]]]
    quotes,mentions,reactions=_comment_maps(visible_comments,actor.id)
    items=[]
    for root in roots:
        replies=replies_by_root[root.id]
        if root.status == "deleted" and not replies:
            continue
        data=_comment_dict(root,actor.id,quotes=quotes,mentions=mentions,reactions=reactions)
        data["replies"]=[_comment_dict(
            x,actor.id,quotes=quotes,mentions=mentions,reactions=reactions,
        ) for x in replies]
        items.append(data)
    return success_response(items,meta=pagination_meta(page,size,total))


@bp.get("/mentionable")
@jwt_required(locations=["headers"])
def mentionable_members():
    actor=current_user()
    post_id=request.args.get("post_id",type=int)
    post=db.session.get(Post,post_id) if post_id else None
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    if not can_read_post(actor.id,post):
        return error_response("RESOURCE_NOT_FOUND","Post 不存在。",404)
    query=(request.args.get("q") or "").strip()[:50]
    stmt=db.select(User).where(
        _mentionable_predicate(post),User.id!=actor.id,
    )
    if query:
        pattern=f"%{query}%"
        stmt=stmt.where(or_(
            User.username_normalized.ilike(pattern),User.nickname.ilike(pattern),
        ))
    users=db.session.scalars(stmt.order_by(User.nickname.asc(),User.id.asc()).limit(20)).all()
    return success_response([{
        "id":user.id,"username":user.username_normalized,"nickname":user.nickname,
        "avatar_media_id":user.avatar_media_id,
    } for user in users])


@bp.get("/<int:comment_id>/context")
@jwt_required(locations=["headers"])
def comment_context(comment_id):
    actor=current_user(); comment=db.session.get(Comment,comment_id)
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    post=db.session.get(Post,comment.post_id) if comment is not None else None
    if (
        comment is None or comment.status not in {"active","deleted"}
        or not can_read_post(actor.id,post)
    ):
        return error_response("RESOURCE_NOT_FOUND","评论不存在。",404)
    page_size=request.args.get("page_size",default=10,type=int)
    if not 1<=page_size<=100:
        return error_response("VALIDATION_ERROR","page_size 不合法。",422)
    root=db.session.get(Comment,comment.parent_id) if comment.parent_id else comment
    if root is None or root.status not in {"active","deleted"}:
        return error_response("RESOURCE_NOT_FOUND","评论不存在。",404)
    preceding=db.session.scalar(db.select(func.count(Comment.id)).where(
        Comment.post_id==post.id,Comment.parent_id.is_(None),
        Comment.status.in_(("active","deleted")),
        or_(
            Comment.created_at<root.created_at,
            and_(Comment.created_at==root.created_at,Comment.id<root.id),
        ),
    )) or 0
    return success_response({
        "comment_id":comment.id,"root_comment_id":root.id,
        "page":preceding//page_size+1,
    })


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
    client_request_id=data.get("client_request_id")
    if _valid_client_request_id(client_request_id) is False:
        return error_response("VALIDATION_ERROR","client_request_id 必须是 UUID。",422)
    mention_ids=_parse_mention_ids(data)
    if mention_ids is None:
        return error_response("VALIDATION_ERROR","mention_user_ids 必须是不重复的成员 ID 列表，最多 10 人。",422)

    if client_request_id:
        existing=db.session.scalar(db.select(Comment).where(
            Comment.author_id==actor.id,Comment.client_request_id==client_request_id,
        ))
        if existing is not None:
            if (
                existing.post_id!=post.id or existing.body!=body.strip()
                or existing.reply_to_comment_id!=data.get("reply_to_comment_id")
            ):
                return error_response("EDIT_CONFLICT","该请求标识已用于另一条评论。",409)
            return success_response(_single_comment_dict(existing,actor.id))

    replied=None
    reply_id=data.get("reply_to_comment_id")
    if reply_id is not None:
        replied=db.session.get(Comment,reply_id) if isinstance(reply_id,int) else None
        if replied is None or replied.post_id != post.id or replied.status != "active":
            return error_response("RESOURCE_NOT_FOUND","回复目标不存在或不可回复。",404)

    mentioned=[]
    if mention_ids:
        if actor.id in mention_ids:
            return error_response("VALIDATION_ERROR","不能提及自己。",422)
        mentioned=db.session.scalars(db.select(User).where(
            User.id.in_(mention_ids),_mentionable_predicate(post),
        )).all()
        if len(mentioned)!=len(mention_ids):
            return error_response("RESOURCE_NOT_FOUND","部分提及成员不可访问。",404)
        if any(f"@{user.username_normalized}" not in body for user in mentioned):
            return error_response("VALIDATION_ERROR","提及成员必须出现在评论正文中。",422)

    comment=Comment(
        post_id=post.id,author_id=actor.id,body=body.strip(),
        parent_id=(replied.parent_id or replied.id) if replied else None,
        reply_to_comment_id=replied.id if replied else None,
        reply_to_user_id=replied.author_id if replied else None,
        client_request_id=client_request_id,
    )
    db.session.add(comment)
    try:
        db.session.flush()
    except IntegrityError:
        db.session.rollback()
        existing=db.session.scalar(db.select(Comment).where(
            Comment.author_id==actor.id,Comment.client_request_id==client_request_id,
        )) if client_request_id else None
        if existing is not None:
            return success_response(_single_comment_dict(existing,actor.id))
        raise

    for user in mentioned:
        db.session.add(CommentMention(comment_id=comment.id,user_id=user.id))

    recipient = replied.author_id if replied else post.author_id
    if recipient != actor.id:
        add_post_notification(
            post=post,user_id=recipient,actor_id=actor.id,
            kind="comment_reply" if replied else "post_comment",
            comment_id=comment.id,
            message="有人回复了你的评论。" if replied else "有人评论了你的 Post。",
        )
    for user in mentioned:
        if user.id not in {actor.id,recipient}:
            add_post_notification(
                post=post,user_id=user.id,actor_id=actor.id,kind="comment_mention",
                comment_id=comment.id,message="有人在评论中提及了你。",
            )
    db.session.commit()
    return success_response(_single_comment_dict(comment,actor.id),201)


@bp.delete("/<int:comment_id>")
@jwt_required(locations=["headers"])
def delete_comment(comment_id):
    actor=current_user()
    comment=db.session.get(Comment,comment_id)
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    post=db.session.get(Post,comment.post_id) if comment is not None else None
    if comment is None or comment.author_id != actor.id or not can_read_post(actor.id,post):
        return error_response("RESOURCE_NOT_FOUND","评论不存在。",404)
    replies=db.session.scalar(db.select(func.count(Comment.id)).where(Comment.parent_id==comment.id)) or 0
    if replies:
        comment.body=None
        comment.status="deleted"
        comment.deleted_at=utcnow()
        db.session.execute(db.delete(CommentMention).where(CommentMention.comment_id==comment.id))
        db.session.execute(db.delete(CommentReaction).where(CommentReaction.comment_id==comment.id))
    else:
        db.session.delete(comment)
    db.session.commit()
    return success_response(None)
