from io import BytesIO

from PIL import Image, UnidentifiedImageError

from app.access import can_read_post, is_collection_member
from app.extensions import db
from app.models import Collection, Media, MediaKind, Post
from app.posts.browsing import serialize_browse_post
from app.storage import get_storage


DISPLAY_MAX_SIZE = (2560, 2560)
THUMBNAIL_MAX_SIZE = (640, 640)


def display_storage_key(public_id):
    return f"displays/{public_id}.webp"


def encode_image_derivatives(image):
    """Return metadata-free display and thumbnail WebP payloads."""
    display = image.copy()
    display.thumbnail(DISPLAY_MAX_SIZE)
    if display.mode not in ("RGB", "RGBA"):
        display = display.convert("RGB")
    display_buffer = BytesIO()
    display.save(display_buffer, "WEBP", quality=90, method=6)

    thumbnail = display.copy()
    thumbnail.thumbnail(THUMBNAIL_MAX_SIZE)
    thumbnail_buffer = BytesIO()
    thumbnail.save(thumbnail_buffer, "WEBP", quality=82, method=6)
    return display_buffer.getvalue(), thumbnail_buffer.getvalue()


def ensure_image_display(media):
    if media.kind == MediaKind.LIVE_PHOTO_VIDEO:
        return media.storage_key
    storage = get_storage()
    if media.display_key and storage.exists(media.display_key):
        return media.display_key
    try:
        image = Image.open(BytesIO(storage.read(media.storage_key)))
        image.load()
    except (FileNotFoundError, UnidentifiedImageError, OSError):
        return None
    display_bytes, _ = encode_image_derivatives(image)
    key = display_storage_key(media.public_id)
    storage.put(key, display_bytes, "image/webp")
    media.display_key = key
    db.session.commit()
    return key


def can_read_media(actor, media):
    if actor is None or media is None or media.status != "active" or media.deleted_at is not None:
        return False
    if media.owner_id == actor.id and media.bound_type is None:
        return True
    if media.bound_type == "avatar":
        return True
    if media.bound_type == "post":
        return can_read_post(actor.id, db.session.get(Post, media.bound_id))
    if media.bound_type == "collection":
        return is_collection_member(actor.id, db.session.get(Collection, media.bound_id))
    return media.owner_id == actor.id


def _logical_parts(media):
    if media.live_photo_pair_id:
        pair = db.session.scalars(
            db.select(Media).where(Media.live_photo_pair_id == media.live_photo_pair_id)
        ).all()
        image = next((item for item in pair if item.kind == MediaKind.LIVE_PHOTO_IMAGE), None)
        video = next((item for item in pair if item.kind == MediaKind.LIVE_PHOTO_VIDEO), None)
        return image, video, pair
    return (media if media.kind == MediaKind.IMAGE else None), None, [media]


def logical_media_item(actor, media, *, management=False, post=None):
    image, video, pair = _logical_parts(media)
    if image is None or (media.live_photo_pair_id and video is None):
        return None
    if management:
        if any(item.owner_id != actor.id or item.deleted_at is not None for item in pair):
            return None
    elif any(not can_read_media(actor, item) for item in pair):
        return None

    if post is None and image.bound_type == "post":
        post = db.session.get(Post, image.bound_id)
    post_data = serialize_browse_post(post, actor_id=actor.id) if post else None
    if post_data:
        post_data.pop("display_media", None)

    image_data = image.to_dict(include_manage_paths=management)
    video_data = video.to_dict(include_manage_paths=management) if video else None
    if management and image.status != "active":
        image_data["display_path"] = image_data["manage_path"]
        image_data["read_path"] = image_data["manage_path"]
    item = {
        "id": image.public_id,
        "kind": "live_photo" if video else "image",
        "image": image_data,
        "video": video_data,
        "live_photo_pair_id": image.live_photo_pair_id,
        "live_photo_manifest_path": image_data.get("live_photo_manifest_path"),
        "post": post_data,
        "author": post_data.get("author") if post_data else image.owner.public_dict(),
        "occurred_at": post_data.get("semantic_time") if post_data else image_data["created_at"],
        "location": post_data.get("location") if post_data else None,
        "permissions": {
            "can_download_original": image.owner_id == actor.id,
        },
    }
    if management:
        item["manage"] = {
            "media_ids": [part.id for part in pair],
            "status": image.status,
            "alt_text": image.alt_text,
            "bound_type": image.bound_type,
            "bound_id": image.bound_id,
        }
    if image.owner_id == actor.id:
        item["downloads"] = [
            {
                "kind": "video" if part.kind == MediaKind.LIVE_PHOTO_VIDEO else "image",
                "filename": part.original_filename,
                "path": part.to_dict(include_manage_paths=True)["original_download_path"],
            }
            for part in pair
        ]
    return item


def resolve_logical_media(actor, public_id):
    media = db.session.scalar(db.select(Media).where(Media.public_id == public_id))
    if media is None:
        return None
    management = media.owner_id == actor.id and media.deleted_at is None
    return logical_media_item(actor, media, management=management)
