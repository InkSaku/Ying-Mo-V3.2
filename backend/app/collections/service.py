from datetime import datetime, timezone

from app.extensions import db
from app.models import Collection, CollectionMember, Notification, PostVisibility, User, UserStatus
from app.posts.service import DomainError


def utcnow():
    return datetime.now(timezone.utc)


def validate_member_ids(creator_id, member_ids):
    if member_ids is None:
        return []
    if not isinstance(member_ids, list):
        raise DomainError("VALIDATION_ERROR", "member_ids 必须是数组。", 422)
    normalized = []
    seen = set()
    for value in member_ids:
        if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
            raise DomainError("VALIDATION_ERROR", "member_ids 只能包含正整数。", 422)
        if value == creator_id:
            raise DomainError("VALIDATION_ERROR", "creator 不能写入 Collection 成员列表。", 422)
        if value not in seen:
            seen.add(value)
            normalized.append(value)
    users = db.session.scalars(
        db.select(User).where(User.id.in_(normalized), User.status == UserStatus.ACTIVE.value)
    ).all() if normalized else []
    found = {u.id for u in users}
    missing = [x for x in normalized if x not in found]
    if missing:
        raise DomainError("VALIDATION_ERROR", "部分 member_ids 不存在或不是有效成员。", 422)
    return normalized


def resolve_member_ids(creator_id, payload):
    select_all = payload.get("select_all_members", False)
    if not isinstance(select_all, bool):
        raise DomainError("VALIDATION_ERROR", "select_all_members 必须是布尔值。", 422)
    if select_all:
        return list(db.session.scalars(
            db.select(User.id).where(
                User.status == UserStatus.ACTIVE.value,
                User.id != creator_id,
            ).order_by(User.id.asc())
        ).all())
    return validate_member_ids(creator_id, payload.get("member_ids", []))


def replace_members(collection, creator_id, member_ids, actor_id):
    if collection.creator_id != creator_id:
        raise DomainError("RESOURCE_NOT_FOUND", "Collection 不存在。", 404)
    desired = set(validate_member_ids(creator_id, member_ids))
    current_links = {link.user_id: link for link in collection.member_links}
    current = set(current_links)
    added = desired - current
    removed = current - desired

    for user_id in added:
        db.session.add(CollectionMember(collection_id=collection.id, user_id=user_id))
        db.session.add(Notification(
            user_id=user_id, actor_id=actor_id, kind="collection_member_added",
            target_type="collection",
            collection_id=collection.id, message=f"你已加入 Collection「{collection.name}」。"
        ))
    for user_id in removed:
        db.session.delete(current_links[user_id])
        db.session.add(Notification(
            user_id=user_id, actor_id=actor_id, kind="collection_member_removed",
            target_type="collection",
            collection_id=collection.id, message=f"你已被移出 Collection「{collection.name}」。"
        ))
    return {"added": sorted(added), "removed": sorted(removed)}


def delete_collection(collection):
    posts = list(collection.posts)
    for post in posts:
        post.collection_id = None
        post.collection_sort_order = None
        post.visibility = PostVisibility.PRIVATE.value

    if not posts and collection.first_shared_at is None:
        db.session.delete(collection)
        return "physical"

    collection.deleted_at = utcnow()
    return "soft"
