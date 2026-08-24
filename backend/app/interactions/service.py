from sqlalchemy import func

from app.extensions import db
from app.models import REACTION_KINDS


REACTION_DEFINITIONS = (
    {"kind": "heart", "emoji": "❤️", "label": "喜欢"},
    {"kind": "like", "emoji": "👍", "label": "赞"},
    {"kind": "laugh", "emoji": "😄", "label": "开心"},
    {"kind": "celebrate", "emoji": "🎉", "label": "庆祝"},
    {"kind": "wow", "emoji": "😮", "label": "惊喜"},
    {"kind": "support", "emoji": "🤗", "label": "支持"},
)


def valid_reaction_kind(value):
    return value if isinstance(value, str) and value in REACTION_KINDS else None


def set_reaction(model, target_column, *, target_id, user_id, kind):
    existing = db.session.scalar(db.select(model).where(
        target_column == target_id,
        model.user_id == user_id,
    ))
    if kind is None:
        if existing is not None:
            db.session.delete(existing)
        return
    if existing is None:
        target_name = target_column.key
        db.session.add(model(user_id=user_id, kind=kind, **{target_name: target_id}))
    else:
        existing.kind = kind


def reaction_summaries(model, target_column, target_ids, *, actor_id):
    ids = list(dict.fromkeys(target_ids))
    result = {target_id: _empty_summary() for target_id in ids}
    if not ids:
        return result

    rows = db.session.execute(
        db.select(target_column, model.kind, func.count(model.id))
        .where(target_column.in_(ids))
        .group_by(target_column, model.kind)
    ).all()
    counts = {target_id: {} for target_id in ids}
    for target_id, kind, count in rows:
        counts[target_id][kind] = int(count or 0)

    mine = dict(db.session.execute(
        db.select(target_column, model.kind).where(
            target_column.in_(ids),
            model.user_id == actor_id,
        )
    ).all())
    for target_id in ids:
        result[target_id] = {
            "selected": mine.get(target_id),
            "items": [
                {**definition, "count": counts[target_id].get(definition["kind"], 0)}
                for definition in REACTION_DEFINITIONS
            ],
        }
    return result


def reaction_summary(model, target_column, target_id, *, actor_id):
    return reaction_summaries(
        model, target_column, [target_id], actor_id=actor_id
    )[target_id]


def _empty_summary():
    return {
        "selected": None,
        "items": [{**definition, "count": 0} for definition in REACTION_DEFINITIONS],
    }
