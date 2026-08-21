import re

from flask import Blueprint, request
from flask_jwt_extended import jwt_required

from app.common.auth import current_user
from app.common.responses import error_response, success_response
from app.explore.service import daily_seed, explore_data


bp = Blueprint("explore", __name__)
SEED_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


@bp.get("")
@jwt_required(locations=["headers"])
def explore():
    actor = current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)
    seed = (request.args.get("seed") or daily_seed()).strip()
    if not SEED_RE.fullmatch(seed):
        return error_response("VALIDATION_ERROR", "seed 不合法。", 422)
    return success_response(explore_data(actor.id, seed))
