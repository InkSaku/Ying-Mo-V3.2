from flask import request


def parse_pagination(default_size=20, max_size=100):
    try:
        page = int(request.args.get("page", 1))
        size = int(request.args.get("page_size", default_size))
    except (TypeError, ValueError):
        return None
    if page < 1 or size < 1 or size > max_size:
        return None
    return page, size


def pagination_meta(page, size, total):
    return {
        "pagination": {
            "page": page,
            "page_size": size,
            "total": total,
            "total_pages": (total + size - 1) // size if total else 0,
            "has_next": page * size < total,
            "has_previous": page > 1,
        }
    }
