from app.extensions import db
from app.models import CollectionNotificationPreference, Notification


DIRECT_COLLECTION_KINDS = {
    "collection_member_added",
    "collection_member_removed",
    "collection_creator_received",
    "collection_creator_transferred",
    "post_removed_from_collection",
}

IMPORTANT_COLLECTION_KINDS = DIRECT_COLLECTION_KINDS | {
    "post_comment",
    "comment_reply",
    "comment_mention",
}


def collection_notification_level(user_id, collection_id):
    level = db.session.scalar(db.select(CollectionNotificationPreference.level).where(
        CollectionNotificationPreference.user_id == user_id,
        CollectionNotificationPreference.collection_id == collection_id,
    ))
    return level or "all"


def add_collection_notification(*, user_id, collection_id, kind, **kwargs):
    level = collection_notification_level(user_id, collection_id)
    if level == "muted" and kind not in DIRECT_COLLECTION_KINDS:
        return None
    if level == "important" and kind not in IMPORTANT_COLLECTION_KINDS:
        return None
    notification = Notification(
        user_id=user_id,
        collection_id=collection_id,
        kind=kind,
        **kwargs,
    )
    db.session.add(notification)
    return notification


def add_post_notification(*, post, user_id, kind, **kwargs):
    values = {
        "user_id": user_id,
        "kind": kind,
        "target_type": "post",
        "post_id": post.id,
        **kwargs,
    }
    if post.collection_id is not None:
        return add_collection_notification(
            collection_id=post.collection_id,
            **values,
        )
    notification = Notification(**values)
    db.session.add(notification)
    return notification
