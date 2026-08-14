from sqlalchemy import and_, case, exists, func, or_

from app.extensions import db
from app.models import (
    Collection,
    CollectionMember,
    CollectionStatus,
    Post,
    PostModerationStatus,
    PostStatus,
    PostVisibility,
)


def is_collection_member(user_id, collection):
    if collection is None or collection.deleted_at is not None or collection.status != CollectionStatus.ACTIVE.value:
        return False
    if collection.creator_id == user_id:
        return True
    return db.session.scalar(
        db.select(exists().where(
            CollectionMember.collection_id == collection.id,
            CollectionMember.user_id == user_id,
        ))
    ) is True


def collection_member_predicate(user_id):
    return and_(
        Collection.deleted_at.is_(None),
        Collection.status == CollectionStatus.ACTIVE.value,
        or_(
            Collection.creator_id == user_id,
            exists().where(
                CollectionMember.collection_id == Collection.id,
                CollectionMember.user_id == user_id,
            ),
        ),
    )


def readable_post_predicate(user_id, *, include_archived=True):
    statuses = [PostStatus.PUBLISHED.value]
    if include_archived:
        statuses.append(PostStatus.ARCHIVED.value)

    independent = and_(
        Post.collection_id.is_(None),
        or_(
            Post.visibility == PostVisibility.LOGIN_ONLY.value,
            Post.author_id == user_id,
        ),
    )
    collection_bound = and_(
        Post.collection_id.is_not(None),
        exists().where(
            Collection.id == Post.collection_id,
            Collection.deleted_at.is_(None),
            Collection.status == CollectionStatus.ACTIVE.value,
            or_(
                Collection.creator_id == user_id,
                exists().where(
                    CollectionMember.collection_id == Collection.id,
                    CollectionMember.user_id == user_id,
                ),
            ),
        ),
    )
    return and_(
        Post.deleted_at.is_(None),
        Post.moderation_status == PostModerationStatus.ACTIVE.value,
        Post.status.in_(statuses),
        or_(independent, collection_bound),
    )


def can_read_post(user_id, post, *, include_archived=True):
    if post is None or post.deleted_at is not None:
        return False
    if post.moderation_status != PostModerationStatus.ACTIVE.value:
        return False
    allowed = {PostStatus.PUBLISHED.value}
    if include_archived:
        allowed.add(PostStatus.ARCHIVED.value)
    if post.status not in allowed:
        return False
    if post.collection_id is None:
        return post.visibility == PostVisibility.LOGIN_ONLY.value or post.author_id == user_id
    return is_collection_member(user_id, post.collection)


def can_manage_post_as_author(user_id, post):
    return bool(post and post.author_id == user_id)


def can_manage_collection_as_creator(user_id, collection):
    return bool(collection and collection.creator_id == user_id and collection.deleted_at is None)


def semantic_time_expression():
    """SQL expression used by every public timeline and archive."""
    return case(
        (Post.post_type == "note", func.coalesce(Post.occurred_at, Post.published_at)),
        else_=Post.published_at,
    )


def author_managed_post_predicate(user_id):
    """Management-only scope; never use this for member content discovery."""
    return and_(Post.author_id == user_id, Post.deleted_at.is_(None))
