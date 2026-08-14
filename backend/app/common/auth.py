from flask_jwt_extended import get_jwt_identity

from app.extensions import db
from app.models import User, UserStatus


def current_user():
    identity = get_jwt_identity()
    if identity is None:
        return None
    try:
        user_id = int(identity)
    except (TypeError, ValueError):
        return None
    user = db.session.get(User, user_id)
    if user is None or user.status != UserStatus.ACTIVE.value:
        return None
    return user
