from sqlalchemy import case, func, or_

from app.access import readable_post_predicate
from app.extensions import db
from app.models import Post, PostType, post_tags
from app.posts.browsing import serialize_browse_post


RELATED_LIMIT = 4
# The major weights preserve the declared hierarchy even when an Article has
# the maximum 20 Tags: Collection > Category > tag overlap > author.
COLLECTION_SCORE = 10_000
CATEGORY_SCORE = 1_000
TAG_SCORE = 10
AUTHOR_SCORE = 1


def related_articles(post, actor_id, *, limit=RELATED_LIMIT):
    """Return a small, deterministic set of ACL-safe, explainable relations."""
    if post.post_type != PostType.ARTICLE.value:
        return []

    active_tags = sorted(
        (tag for tag in post.tags if tag.is_active),
        key=lambda tag: (tag.name, tag.id),
    )
    tag_ids = [tag.id for tag in active_tags]
    relation_filters = []

    if post.collection_id is not None:
        relation_filters.append(Post.collection_id == post.collection_id)
    if post.category_id is not None and post.category and post.category.is_active:
        relation_filters.append(Post.category_id == post.category_id)

    overlap_count = None
    if tag_ids:
        candidate_tags = post_tags.alias("candidate_related_tags")
        overlap_count = (
            db.select(func.count(candidate_tags.c.tag_id))
            .where(
                candidate_tags.c.post_id == Post.id,
                candidate_tags.c.tag_id.in_(tag_ids),
            )
            .correlate(Post)
            .scalar_subquery()
        )
        relation_filters.append(overlap_count > 0)

    # Same-author alone is intentionally not a qualification signal: it only
    # breaks otherwise meaningful relations by a small, explainable amount.
    if not relation_filters:
        return []

    score = case(
        (Post.author_id == post.author_id, AUTHOR_SCORE), else_=0
    )
    if post.collection_id is not None:
        score = score + case(
            (Post.collection_id == post.collection_id, COLLECTION_SCORE), else_=0
        )
    if post.category_id is not None and post.category and post.category.is_active:
        score = score + case(
            (Post.category_id == post.category_id, CATEGORY_SCORE), else_=0
        )
    if overlap_count is not None:
        score = score + overlap_count * TAG_SCORE

    rows = db.session.execute(
        db.select(Post, score.label("relation_score"))
        .where(
            readable_post_predicate(actor_id, include_archived=True),
            Post.post_type == PostType.ARTICLE.value,
            Post.id != post.id,
            or_(*relation_filters),
        )
        .order_by(score.desc(), Post.published_at.desc(), Post.id.desc())
        .limit(limit)
    ).all()

    source_tag_names = {tag.id: tag.name for tag in active_tags}
    result = []
    for candidate, _relation_score in rows:
        reasons = []
        if post.collection_id is not None and candidate.collection_id == post.collection_id:
            reasons.append(f"同属「{post.collection.name}」合集")
        if (
            post.category_id is not None
            and candidate.category_id == post.category_id
            and post.category
            and post.category.is_active
        ):
            reasons.append(f"同属{post.category.name}分类")
        shared_tag_names = [
            source_tag_names[tag.id]
            for tag in candidate.tags
            if tag.id in source_tag_names and tag.is_active
        ]
        shared_tag_names.sort()
        if shared_tag_names:
            reasons.append(f"共同标签：{'、'.join(shared_tag_names)}")
        if candidate.author_id == post.author_id:
            reasons.append("同一作者")

        item = serialize_browse_post(candidate, actor_id=actor_id)
        item["related_reasons"] = reasons
        result.append(item)
    return result
