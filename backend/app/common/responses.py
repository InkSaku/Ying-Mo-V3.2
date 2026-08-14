from flask import g, jsonify


def success_response(data=None, status=200, *, meta=None):
    payload = {"ok": True, "data": data}
    if meta is not None:
        payload["meta"] = meta
    payload["request_id"] = getattr(g, "request_id", None)
    return jsonify(payload), status


def error_response(code, message, status=400, *, details=None):
    error = {"code": code, "message": message}
    if details is not None:
        error["details"] = details
    return jsonify({
        "ok": False,
        "error": error,
        "request_id": getattr(g, "request_id", None),
    }), status
