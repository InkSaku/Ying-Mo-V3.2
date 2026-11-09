from datetime import datetime, timezone

from app.extensions import db
from app.models import Collection, CollectionMember, CollectionStatus, Notification, PostVisibility, User, UserStatus
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


def add_member(collection, creator_id, user_id):
    """只加入一位成员，不改动其他成员。已是成员时不重复写入，也不再发通知。"""
    if collection.creator_id != creator_id or collection.deleted_at is not None:
        raise DomainError("RESOURCE_NOT_FOUND", "Collection 不存在。", 404)
    if collection.status != CollectionStatus.ACTIVE.value:
        raise DomainError("VALIDATION_ERROR", "这个合集当前不能添加成员。", 422)
    validate_member_ids(creator_id, [user_id])
    exists = db.session.scalar(db.select(CollectionMember.id).where(
        CollectionMember.collection_id == collection.id,
        CollectionMember.user_id == user_id,
    ))
    if exists:
        return False
    db.session.add(CollectionMember(collection_id=collection.id, user_id=user_id))
    db.session.add(Notification(
        user_id=user_id, actor_id=creator_id, kind="collection_member_added",
        target_type="collection",
        collection_id=collection.id, message=f"你已加入合集「{collection.name}」。"
    ))
    return True


def creator_join_options(creator_id, member, limit=8):
    """当前成员作为创建者管理的合集，以及 member 是否已在其中；供“加进合集”入口使用。"""
    if member is None or member.status != UserStatus.ACTIVE.value or member.id == creator_id:
        return []
    collections = db.session.scalars(
        db.select(Collection).where(
            Collection.creator_id == creator_id,
            Collection.deleted_at.is_(None),
            Collection.status == CollectionStatus.ACTIVE.value,
        ).order_by(Collection.updated_at.desc(), Collection.id.desc()).limit(limit)
    ).all()
    if not collections:
        return []
    joined = set(db.session.scalars(db.select(CollectionMember.collection_id).where(
        CollectionMember.user_id == member.id,
        CollectionMember.collection_id.in_([collection.id for collection in collections]),
    )).all())
    return [
        {"id": collection.id, "name": collection.name, "slug": collection.slug, "is_member": collection.id in joined}
        for collection in collections
    ]


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
            collection_id=collection.id, message=f"你已加入合集「{collection.name}」。"
        ))
    for user_id in removed:
        db.session.delete(current_links[user_id])
        db.session.add(Notification(
            user_id=user_id, actor_id=actor_id, kind="collection_member_removed",
            target_type="collection",
            collection_id=collection.id, message=f"你已被移出合集「{collection.name}」。"
        ))
    return {"added": sorted(added), "removed": sorted(removed)}


def transfer_creator(collection_id, actor_id, new_creator_id):
    if isinstance(new_creator_id, bool) or not isinstance(new_creator_id, int) or new_creator_id <= 0:
        raise DomainError("VALIDATION_ERROR", "new_creator_id 必须是正整数。", 422)
    if new_creator_id == actor_id:
        raise DomainError("VALIDATION_ERROR", "不能将 Collection 转让给自己。", 422)

    collection = db.session.scalar(
        db.select(Collection).where(Collection.id == collection_id).with_for_update()
    )
    if collection is None or collection.deleted_at is not None or collection.creator_id != actor_id:
        raise DomainError("RESOURCE_NOT_FOUND", "Collection 不存在。", 404)

    target = db.session.get(User, new_creator_id)
    target_link = db.session.scalar(db.select(CollectionMember).where(
        CollectionMember.collection_id == collection.id,
        CollectionMember.user_id == new_creator_id,
    ))
    if target is None or target.status != UserStatus.ACTIVE.value or target_link is None:
        raise DomainError("VALIDATION_ERROR", "新创建者必须是当前有效成员。", 422)

    db.session.delete(target_link)
    db.session.flush()
    updated = db.session.execute(
        db.update(Collection).where(
            Collection.id == collection.id,
            Collection.creator_id == actor_id,
            Collection.deleted_at.is_(None),
        ).values(creator_id=new_creator_id, updated_at=utcnow()),
        execution_options={"synchronize_session": False},
    )
    if updated.rowcount != 1:
        raise DomainError("EDIT_CONFLICT", "Collection 创建者已发生变化，请刷新后重试。", 409)
    db.session.add(CollectionMember(
        collection_id=collection.id,
        user_id=actor_id,
        join_source="manual",
    ))
    db.session.flush()
    db.session.expire(collection)
    return collection, target


def delete_collection(collection):
    """调用方须先用 lock_collection 取得合集行锁，这里继续锁 Post 和关系行。"""
    from app.posts.memory_contributions import invalidate_links_for_collection, lock_collection_posts

    now = utcnow()
    posts = lock_collection_posts(collection.id)
    invalidate_links_for_collection(collection.id, "collection_deleted")
    for post in posts:
        post.collection_id = None
        post.collection_sort_order = None
        post.collection_highlight_order = None
        post.visibility = PostVisibility.PRIVATE.value

    if not posts and collection.first_shared_at is None:
        db.session.delete(collection)
        return "physical"

    collection.deleted_at = now
    return "soft"
