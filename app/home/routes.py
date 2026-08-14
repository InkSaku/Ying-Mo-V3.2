from flask import Blueprint
from flask_jwt_extended import jwt_required
from sqlalchemy import func
from sqlalchemy.orm import joinedload, selectinload

from app.access import collection_member_predicate, readable_post_predicate
from app.common.auth import current_user
from app.common.responses import error_response, success_response
from app.extensions import db
from app.models import Collection, FeaturedContent, Post, PostStatus, PostType
from app.posts.service import current_article_slug

bp=Blueprint("home",__name__)


def _post_items(actor_id,post_type,limit=6):
    rows=db.session.scalars(
        db.select(Post).options(
            joinedload(Post.author), joinedload(Post.category), joinedload(Post.collection), selectinload(Post.tags)
        ).where(
            readable_post_predicate(actor_id,include_archived=False),
            Post.status==PostStatus.PUBLISHED.value,
            Post.post_type==post_type,
        ).order_by(
            (func.coalesce(Post.occurred_at,Post.published_at) if post_type==PostType.NOTE.value else Post.published_at).desc(),
            Post.id.desc(),
        ).limit(limit)
    ).all()
    items=[]
    for p in rows:
        item=p.to_dict(include_body=False)
        if p.post_type==PostType.ARTICLE.value:
            item["slug"]=current_article_slug(p.id)
        items.append(item)
    return items


@bp.get("")
@jwt_required(locations=["headers"])
def home():
    actor=current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    collections=db.session.scalars(
        db.select(Collection).options(joinedload(Collection.creator)).where(
            collection_member_predicate(actor.id)
        ).order_by(Collection.updated_at.desc()).limit(6)
    ).all()
    featured_articles=db.session.scalars(
        db.select(Post).join(FeaturedContent,FeaturedContent.post_id==Post.id).options(
            joinedload(Post.author),joinedload(Post.category),joinedload(Post.collection),selectinload(Post.tags)
        ).where(
            FeaturedContent.is_active.is_(True),
            FeaturedContent.content_type=="article",
            Post.post_type==PostType.ARTICLE.value,
            Post.status==PostStatus.PUBLISHED.value,
            readable_post_predicate(actor.id,include_archived=False),
        ).order_by(FeaturedContent.sort_order.asc(),FeaturedContent.id.asc()).limit(6)
    ).all()
    featured_collections=db.session.scalars(
        db.select(Collection).join(
            FeaturedContent,FeaturedContent.collection_id==Collection.id
        ).options(joinedload(Collection.creator)).where(
            FeaturedContent.is_active.is_(True),
            FeaturedContent.content_type=="collection",
            collection_member_predicate(actor.id),
        ).order_by(FeaturedContent.sort_order.asc(),FeaturedContent.id.asc()).limit(6)
    ).all()
    featured_article_items=[]
    for post in featured_articles:
        item=post.to_dict(include_body=False); item["slug"]=current_article_slug(post.id)
        featured_article_items.append(item)
    return success_response({
        "featured_articles":featured_article_items,
        "featured_collections":[c.to_dict() for c in featured_collections],
        "recent_articles":_post_items(actor.id,PostType.ARTICLE.value),
        "recent_notes":_post_items(actor.id,PostType.NOTE.value),
        "collections":[c.to_dict() for c in collections],
    })
