import hashlib
import json

from sqlalchemy.orm import joinedload, selectinload

from app.access import readable_post_predicate
from app.common.time import isoformat_utc
from app.extensions import db
from app.models import Collection, FeaturedContent, Post, SiteSetting
from app.posts.browsing import serialize_browse_posts

HOME_PIN_LIMIT = 3
_REVISION_KEY = "home_featured_revision"


def featured_eligible_query(content_type):
    query = db.select(FeaturedContent).where(
        FeaturedContent.content_type == content_type,
        FeaturedContent.is_active.is_(True),
    )
    if content_type == "article":
        return query.join(Post, FeaturedContent.post_id == Post.id).where(
            Post.post_type == "article", Post.status == "published",
            Post.moderation_status == "active", Post.deleted_at.is_(None),
        )
    return query.join(Collection, FeaturedContent.collection_id == Collection.id).where(
        Collection.status == "active", Collection.deleted_at.is_(None),
    )


def lock_featured_configuration(actor_id):
    # The existing settings table supplies one durable lock even for an empty list.
    # SQLite's write lock and MySQL's row lock serialize capacity checks and moves.
    dialect = db.session.get_bind().dialect.name
    if dialect == "mysql":
        from sqlalchemy.dialects.mysql import insert
        statement = insert(SiteSetting).values(key=_REVISION_KEY, value=0, updated_by_id=actor_id)
        statement = statement.on_duplicate_key_update(key=_REVISION_KEY)
    else:
        from sqlalchemy.dialects.sqlite import insert
        statement = insert(SiteSetting).values(key=_REVISION_KEY, value=0, updated_by_id=actor_id)
        statement = statement.on_conflict_do_nothing(index_elements=[SiteSetting.key])
    db.session.execute(statement)
    configuration = db.session.scalar(db.select(SiteSetting).where(
        SiteSetting.key == _REVISION_KEY,
    ).with_for_update().execution_options(populate_existing=True))
    configuration.updated_by_id = actor_id
    return configuration


def bump_featured_revision(configuration):
    configuration.value = int(configuration.value or 0) + 1


def active_featured_rows(content_type, *, lock=False):
    query = featured_eligible_query(content_type).order_by(FeaturedContent.sort_order, FeaturedContent.id)
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    return list(db.session.scalars(query).all())


def home_pins_data(actor_id):
    rows = db.session.scalars(
        db.select(Post).join(FeaturedContent, FeaturedContent.post_id == Post.id).where(
            FeaturedContent.content_type == "article", FeaturedContent.is_active.is_(True),
            Post.post_type == "article", readable_post_predicate(actor_id, include_archived=False),
        ).options(
            joinedload(Post.author), joinedload(Post.category), joinedload(Post.collection), selectinload(Post.tags),
        ).order_by(FeaturedContent.sort_order, FeaturedContent.id).limit(HOME_PIN_LIMIT)
    ).all()
    revision = db.session.get(SiteSetting, _REVISION_KEY)
    signature = hashlib.sha256(json.dumps([
        revision.value if revision else 0,
        [[post.id, isoformat_utc(post.updated_at)] for post in rows],
    ], separators=(",", ":")).encode()).hexdigest()[:24]
    return {"items": serialize_browse_posts(rows, actor_id=actor_id), "signature": signature}
