from io import BytesIO
import hashlib
from pathlib import Path
import shutil
import subprocess
import tempfile
import uuid

from flask import Blueprint, current_app, request, send_file
from flask_jwt_extended import jwt_required
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import func

from app.common.auth import current_user
from app.common.markdown import remove_media_placeholders
from app.common.pagination import pagination_meta, parse_pagination
from app.common.responses import error_response, success_response
from app.extensions import db, limiter
from app.models import Collection, Media, Post, User
from app.media_memory import (
    can_read_media,
    display_storage_key,
    encode_image_derivatives,
    ensure_image_display,
    logical_media_item,
    resolve_logical_media,
)
from app.storage import get_storage

bp=Blueprint("uploads",__name__)
ALLOWED_FORMATS={
    "JPEG":("image/jpeg",".jpg"),
    "PNG":("image/png",".png"),
    "WEBP":("image/webp",".webp"),
    "HEIF":("image/heic",".heic"),
}


def _paths(public_id,ext):
    return f"images/{public_id}{ext}",f"thumbnails/{public_id}.webp"


def _video_path(public_id,ext):
    return f"live-photo-videos/{public_id}{ext}"


def _video_display_path(public_id):
    return f"live-photo-displays/{public_id}.mp4"


def _read_image(file):
    raw=file.read(current_app.config["IMAGE_MAX_BYTES"]+1)
    if len(raw)>current_app.config["IMAGE_MAX_BYTES"]:
        raise ValueError("too_large")
    try:
        probe=Image.open(BytesIO(raw)); fmt=probe.format; probe.verify()
        if fmt not in ALLOWED_FORMATS:
            raise ValueError("unsupported")
        image=Image.open(BytesIO(raw)); image.load()
        image=ImageOps.exif_transpose(image)
    except (UnidentifiedImageError,OSError):
        raise ValueError("invalid")
    return raw,image,fmt


def _read_live_video(file):
    raw=file.read(current_app.config["IMAGE_MAX_BYTES"]+1)
    if len(raw)>current_app.config["IMAGE_MAX_BYTES"]:
        raise ValueError("too_large")
    if len(raw)<12 or b"ftyp" not in raw[:32]:
        raise ValueError("invalid")
    quicktime=b"qt  " in raw[:32]
    return raw,("video/quicktime" if quicktime else "video/mp4"),(".mov" if quicktime else ".mp4")


def _browser_video(raw, source_suffix):
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return raw, False
    with tempfile.TemporaryDirectory(prefix="yingmo-live-") as directory:
        source = Path(directory) / f"source{source_suffix}"
        target = Path(directory) / "display.mp4"
        source.write_bytes(raw)
        try:
            result = subprocess.run(
                [
                    ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
                    "-i", str(source), "-map_metadata", "-1",
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
                    "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                    "-an", str(target),
                ],
                capture_output=True,
                check=False,
                timeout=60,
            )
        except (OSError, subprocess.TimeoutExpired):
            return raw, False
        if result.returncode != 0 or not target.exists() or target.stat().st_size == 0:
            return raw, False
        return target.read_bytes(), True


def _write_image_files(raw,image,fmt,public_id):
    mime,ext=ALLOWED_FORMATS[fmt]
    original,thumb=_paths(public_id,ext)
    display=display_storage_key(public_id)
    get_storage().put(original,raw,mime)
    display_bytes,thumbnail_bytes=encode_image_derivatives(image)
    get_storage().put(display,display_bytes,"image/webp")
    get_storage().put(thumb,thumbnail_bytes,"image/webp")
    return mime,original,display,thumb


@bp.post("/images")
@jwt_required(locations=["headers"])
@limiter.limit(lambda: current_app.config["RATE_LIMIT_UPLOAD"])
def upload_image():
    actor=current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    file=request.files.get("file")
    if file is None:
        return error_response("VALIDATION_ERROR","缺少 file。",422)
    try:
        raw,image,fmt=_read_image(file)
    except ValueError as error:
        if str(error)=="too_large":
            return error_response("PAYLOAD_TOO_LARGE","图片不得超过 15 MB。",413)
        return error_response("VALIDATION_ERROR","文件不是有效图片。",422)
    public_id=str(uuid.uuid4())
    mime,original,display,thumb=_write_image_files(raw,image,fmt,public_id)
    content_sha256=hashlib.sha256(raw).hexdigest()
    duplicate=db.session.scalar(db.select(Media).where(
        Media.owner_id==actor.id,
        Media.content_sha256==content_sha256,
        Media.deleted_at.is_(None),
    ).order_by(Media.id.asc()))
    media=Media(
        public_id=public_id,owner_id=actor.id,kind="image",mime_type=mime,
        byte_size=len(raw),width=image.width,height=image.height,
        storage_key=original,display_key=display,thumbnail_key=thumb,content_sha256=content_sha256,
        original_filename=Path(file.filename or "image").name[:255],
    )
    db.session.add(media); db.session.commit()
    data=media.to_dict(include_manage_paths=True)
    data["duplicate_of_id"]=duplicate.id if duplicate else None
    return success_response(data,201)


@bp.post("/live-photos")
@jwt_required(locations=["headers"])
@limiter.limit(lambda: current_app.config["RATE_LIMIT_UPLOAD"])
def upload_live_photo():
    actor=current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    image_file=request.files.get("image"); video_file=request.files.get("video")
    if image_file is None or video_file is None:
        return error_response("VALIDATION_ERROR","Live Photo 需要 image 和 video。",422)
    try:
        image_raw,image_obj,image_fmt=_read_image(image_file)
        video_raw,video_mime,video_ext=_read_live_video(video_file)
    except ValueError as error:
        if str(error)=="too_large":
            return error_response("PAYLOAD_TOO_LARGE","Live Photo 单文件不得超过 15 MB。",413)
        return error_response("VALIDATION_ERROR","Live Photo 文件格式不合法。",422)
    pair_id=str(uuid.uuid4()); image_public_id=str(uuid.uuid4()); video_public_id=str(uuid.uuid4())
    image_mime,image_path,display_path,thumb_path=_write_image_files(
        image_raw,image_obj,image_fmt,image_public_id
    )
    video_path=_video_path(video_public_id,video_ext)
    video_display_bytes,converted=_browser_video(video_raw,video_ext)
    video_display_path=_video_display_path(video_public_id) if converted else video_path
    get_storage().put(video_path,video_raw,video_mime)
    if converted:
        get_storage().put(video_display_path,video_display_bytes,"video/mp4")
    image_media=Media(
        public_id=image_public_id,owner_id=actor.id,kind="live_photo_image",mime_type=image_mime,
        byte_size=len(image_raw),width=image_obj.width,height=image_obj.height,
        storage_key=image_path,display_key=display_path,thumbnail_key=thumb_path,
        live_photo_pair_id=pair_id,content_sha256=hashlib.sha256(image_raw).hexdigest(),
        original_filename=Path(image_file.filename or "live-photo-image").name[:255],
    )
    video_media=Media(
        public_id=video_public_id,owner_id=actor.id,kind="live_photo_video",mime_type=video_mime,
        byte_size=len(video_raw),storage_key=video_path,display_key=video_display_path,
        live_photo_pair_id=pair_id,content_sha256=hashlib.sha256(video_raw).hexdigest(),
        original_filename=Path(video_file.filename or "live-photo-video").name[:255],
    )
    db.session.add_all([image_media,video_media]); db.session.commit()
    return success_response({
        "pair_id":pair_id,"image":image_media.to_dict(),"video":video_media.to_dict(),
    },201)


@bp.post("/<int:media_id>/bind")
@jwt_required(locations=["headers"])
def bind(media_id):
    actor=current_user(); media=db.session.get(Media,media_id); data=request.get_json(silent=True) or {}
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    if media is None or media.owner_id!=actor.id or media.status!="active" or media.deleted_at is not None:
        return error_response("RESOURCE_NOT_FOUND","媒体不存在。",404)
    bound_type=data.get("bound_type"); bound_id=data.get("bound_id")
    pair=[media]
    if media.live_photo_pair_id:
        pair=db.session.scalars(db.select(Media).where(Media.live_photo_pair_id==media.live_photo_pair_id)).all()
        if len(pair)!=2 or any(item.owner_id!=actor.id for item in pair):
            return error_response("RESOURCE_NOT_FOUND","Live Photo 配对不存在。",404)
    if bound_type=="post":
        target=db.session.get(Post,bound_id) if isinstance(bound_id,int) else None
        if target is None or target.author_id!=actor.id or target.deleted_at is not None:
            return error_response("RESOURCE_NOT_FOUND","Post 不存在。",404)
    elif bound_type=="collection":
        target=db.session.get(Collection,bound_id) if isinstance(bound_id,int) else None
        if target is None or target.creator_id!=actor.id or target.deleted_at is not None or any(
            item.kind=="live_photo_video" for item in pair
        ):
            return error_response("RESOURCE_NOT_FOUND","Collection 不存在。",404)
    elif bound_type=="avatar":
        if bound_id!=actor.id or any(item.kind=="live_photo_video" for item in pair):
            return error_response("PERMISSION_DENIED","只能绑定自己的头像。",403)
    else:
        return error_response("VALIDATION_ERROR","bound_type 不合法。",422)
    if any(item.bound_type is not None and (item.bound_type!=bound_type or item.bound_id!=bound_id) for item in pair):
        return error_response("CONFLICT","媒体已绑定到其他资源。",409)
    for item in pair:
        item.bound_type=bound_type; item.bound_id=bound_id
    db.session.commit()
    return success_response({"media":[item.to_dict() for item in pair]})


@bp.delete("/<int:media_id>/bind")
@jwt_required(locations=["headers"])
def unbind(media_id):
    actor=current_user(); media=db.session.get(Media,media_id)
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    if media is None or media.owner_id!=actor.id or media.deleted_at is not None:
        return error_response("RESOURCE_NOT_FOUND","媒体不存在。",404)

    pair=[media]
    if media.live_photo_pair_id:
        pair=db.session.scalars(
            db.select(Media).where(Media.live_photo_pair_id==media.live_photo_pair_id)
        ).all()
        if len(pair)!=2 or any(item.owner_id!=actor.id or item.deleted_at is not None for item in pair):
            return error_response("RESOURCE_NOT_FOUND","Live Photo 配对不存在。",404)

    bindings={(item.bound_type,item.bound_id) for item in pair}
    if len(bindings)>1:
        return error_response("CONFLICT","Live Photo 绑定状态不一致。",409)
    bound_type,bound_id=next(iter(bindings))
    media_ids={item.id for item in pair}

    if bound_type=="post":
        target=db.session.get(Post,bound_id)
        if target:
            target.body=remove_media_placeholders(target.body,media_ids)
            if target.cover_media_id in media_ids:
                target.cover_media_id=None
    elif bound_type=="collection":
        target=db.session.get(Collection,bound_id)
        if target and target.cover_media_id in media_ids:
            target.cover_media_id=None
    elif bound_type=="avatar":
        target=db.session.get(User,bound_id)
        if target and target.avatar_media_id in media_ids:
            target.avatar_media_id=None
    elif bound_type is not None:
        return error_response("CONFLICT","媒体绑定类型不受支持。",409)

    for item in pair:
        item.bound_type=None; item.bound_id=None
    db.session.commit()
    return success_response({
        "unbound_from":{"bound_type":bound_type,"bound_id":bound_id} if bound_type else None,
        "media":[item.to_dict(include_manage_paths=True) for item in pair],
    })


@bp.get("/live-photos/<pair_id>")
@jwt_required(locations=["headers"])
def live_photo(pair_id):
    actor=current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    items=db.session.scalars(db.select(Media).where(Media.live_photo_pair_id==pair_id)).all()
    if len(items)!=2 or any(not can_read_media(actor,item) for item in items):
        return error_response("RESOURCE_NOT_FOUND","Live Photo 不存在。",404)
    image_item=next((item for item in items if item.kind=="live_photo_image"),None)
    video_item=next((item for item in items if item.kind=="live_photo_video"),None)
    if image_item is None or video_item is None:
        return error_response("RESOURCE_NOT_FOUND","Live Photo 不存在。",404)
    return success_response({
        "pair_id":pair_id,
        "image":image_item.to_dict(),
        "video":video_item.to_dict(),
        "image_path":f"/api/v1/uploads/images/{image_item.public_id}",
        "thumbnail_path":f"/api/v1/uploads/images/{image_item.public_id}/thumbnail",
        "video_path":f"/api/v1/uploads/images/{video_item.public_id}",
    })


@bp.get("/images/<public_id>")
@jwt_required(locations=["headers"])
def image(public_id):
    actor=current_user(); media=db.session.scalar(db.select(Media).where(Media.public_id==public_id))
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    if media is None or not can_read_media(actor,media):
        return error_response("RESOURCE_NOT_FOUND","媒体不存在。",404)
    storage=get_storage()
    key=(media.display_key or media.storage_key) if media.kind=="live_photo_video" else ensure_image_display(media)
    if not key or not storage.exists(key):
        return error_response("RESOURCE_NOT_FOUND","媒体文件不存在。",404)
    mime=("video/mp4" if media.kind=="live_photo_video" and media.display_key != media.storage_key else media.mime_type) if media.kind=="live_photo_video" else "image/webp"
    return send_file(BytesIO(storage.read(key)),mimetype=mime,conditional=False,max_age=0)


@bp.get("/images/<public_id>/thumbnail")
@jwt_required(locations=["headers"])
def thumbnail(public_id):
    actor=current_user(); media=db.session.scalar(db.select(Media).where(Media.public_id==public_id))
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    if media is None or media.kind=="live_photo_video" or not can_read_media(actor,media):
        return error_response("RESOURCE_NOT_FOUND","媒体不存在。",404)
    storage=get_storage(); key=media.thumbnail_key or ensure_image_display(media)
    if not storage.exists(key):
        return error_response("RESOURCE_NOT_FOUND","媒体文件不存在。",404)
    return send_file(BytesIO(storage.read(key)),mimetype="image/webp",conditional=False,max_age=0)


@bp.get("/gallery/<public_id>")
@jwt_required(locations=["headers"])
def gallery_item(public_id):
    actor=current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    item=resolve_logical_media(actor,public_id)
    if item is None:
        return error_response("RESOURCE_NOT_FOUND","媒体不存在。",404)
    return success_response(item)


@bp.get("/manage/images/<public_id>")
@jwt_required(locations=["headers"])
def owner_image(public_id):
    actor=current_user(); media=db.session.scalar(db.select(Media).where(Media.public_id==public_id))
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    if media is None or media.owner_id != actor.id or media.deleted_at is not None:
        return error_response("RESOURCE_NOT_FOUND","媒体不存在。",404)
    storage=get_storage()
    if not storage.exists(media.storage_key):
        return error_response("RESOURCE_NOT_FOUND","媒体文件不存在。",404)
    return send_file(BytesIO(storage.read(media.storage_key)),mimetype=media.mime_type,conditional=False,max_age=0)


@bp.get("/manage/images/<public_id>/thumbnail")
@jwt_required(locations=["headers"])
def owner_thumbnail(public_id):
    actor=current_user(); media=db.session.scalar(db.select(Media).where(Media.public_id==public_id))
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    if media is None or media.owner_id != actor.id or media.deleted_at is not None or media.kind=="live_photo_video":
        return error_response("RESOURCE_NOT_FOUND","媒体不存在。",404)
    storage=get_storage(); key=media.thumbnail_key or media.storage_key
    if not storage.exists(key):
        return error_response("RESOURCE_NOT_FOUND","媒体文件不存在。",404)
    return send_file(BytesIO(storage.read(key)),mimetype="image/webp" if media.thumbnail_key else media.mime_type,conditional=False,max_age=0)


@bp.get("/manage/images/<public_id>/original")
@jwt_required(locations=["headers"])
def owner_original(public_id):
    actor=current_user(); media=db.session.scalar(db.select(Media).where(Media.public_id==public_id))
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    if media is None or media.owner_id != actor.id or media.deleted_at is not None:
        return error_response("RESOURCE_NOT_FOUND","媒体不存在。",404)
    storage=get_storage()
    if not storage.exists(media.storage_key):
        return error_response("RESOURCE_NOT_FOUND","媒体文件不存在。",404)
    filename=media.original_filename or f"{media.public_id}{Path(media.storage_key).suffix}"
    return send_file(
        BytesIO(storage.read(media.storage_key)),mimetype=media.mime_type,
        as_attachment=True,download_name=filename,conditional=False,max_age=0,
    )


@bp.get("/manage/media")
@jwt_required(locations=["headers"])
def owner_media_list():
    actor=current_user(); args=parse_pagination(default_size=24,max_size=50)
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    if not args:
        return error_response("VALIDATION_ERROR","分页参数不合法。",422)
    page,size=args
    status=request.args.get("status","active").strip().lower()
    if status not in {"active","hidden","all"}:
        return error_response("VALIDATION_ERROR","status 不合法。",422)
    stmt=db.select(Media).where(Media.owner_id==actor.id,Media.deleted_at.is_(None))
    if status!="all":
        stmt=stmt.where(Media.status==status)
    total=db.session.scalar(db.select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows=db.session.scalars(stmt.order_by(Media.created_at.desc(),Media.id.desc()).offset((page-1)*size).limit(size)).all()
    return success_response(
        [item.to_dict(include_manage_paths=True) for item in rows],
        meta=pagination_meta(page,size,total),
    )


@bp.get("/manage/gallery")
@jwt_required(locations=["headers"])
def owner_gallery():
    actor=current_user(); args=parse_pagination(default_size=24,max_size=50)
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    if not args:
        return error_response("VALIDATION_ERROR","分页参数不合法。",422)
    page,size=args
    status=request.args.get("status","active").strip().lower()
    kind=request.args.get("kind","").strip().lower()
    if status not in {"active","hidden","all"} or kind not in {"","image","live_photo"}:
        return error_response("VALIDATION_ERROR","媒体筛选参数不合法。",422)
    stmt=db.select(Media).where(
        Media.owner_id==actor.id,
        Media.deleted_at.is_(None),
        Media.kind.in_(("image","live_photo_image")),
    )
    if status!="all":
        stmt=stmt.where(Media.status==status)
    if kind=="image":
        stmt=stmt.where(Media.kind=="image")
    elif kind=="live_photo":
        stmt=stmt.where(Media.kind=="live_photo_image")
    total=db.session.scalar(db.select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows=db.session.scalars(
        stmt.order_by(Media.created_at.desc(),Media.id.desc())
        .offset((page-1)*size).limit(size)
    ).all()
    items=[logical_media_item(actor,row,management=True) for row in rows]
    return success_response(
        [item for item in items if item],meta=pagination_meta(page,size,total)
    )


@bp.patch("/manage/media/<int:media_id>")
@jwt_required(locations=["headers"])
def update_owner_media(media_id):
    actor=current_user(); media=db.session.get(Media,media_id); data=request.get_json(silent=True)
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    if media is None or media.owner_id!=actor.id or media.deleted_at is not None:
        return error_response("RESOURCE_NOT_FOUND","媒体不存在。",404)
    allowed={"alt_text","caption","display_size","alignment"}
    if not isinstance(data,dict) or not data or not set(data).issubset(allowed):
        return error_response("VALIDATION_ERROR","媒体展示字段不合法。",422)
    if media.kind=="live_photo_video":
        return error_response("VALIDATION_ERROR","Live Photo 视频文件不单独设置展示信息。",422)
    if "alt_text" in data:
        alt_text=data["alt_text"]
        if alt_text is not None and (not isinstance(alt_text,str) or len(alt_text.strip())>300):
            return error_response("VALIDATION_ERROR","ALT 文本不得超过 300 个字符。",422)
        media.alt_text=alt_text.strip() if isinstance(alt_text,str) and alt_text.strip() else None
    if "caption" in data:
        caption=data["caption"]
        if caption is not None and (not isinstance(caption,str) or len(caption.strip())>500):
            return error_response("VALIDATION_ERROR","图片图注不得超过 500 个字符。",422)
        media.caption=caption.strip() if isinstance(caption,str) and caption.strip() else None
    if "display_size" in data:
        if data["display_size"] not in {"small","medium","large","full"}:
            return error_response("VALIDATION_ERROR","图片尺寸设置不合法。",422)
        media.display_size=data["display_size"]
    if "alignment" in data:
        if data["alignment"] not in {"left","center","right"}:
            return error_response("VALIDATION_ERROR","图片对齐设置不合法。",422)
        media.alignment=data["alignment"]
    db.session.commit()
    return success_response(media.to_dict(include_manage_paths=True))


@bp.post("/manage/media/batch")
@jwt_required(locations=["headers"])
def batch_owner_media():
    actor=current_user(); data=request.get_json(silent=True)
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    if not isinstance(data,dict) or set(data)!={"media_ids","action"}:
        return error_response("VALIDATION_ERROR","需要 media_ids 与 action。",422)
    media_ids=data["media_ids"]; action=data["action"]
    if not isinstance(media_ids,list) or not 1<=len(media_ids)<=50 or any(
        isinstance(value,bool) or not isinstance(value,int) or value<=0 for value in media_ids
    ) or action not in {"hide","restore"}:
        return error_response("VALIDATION_ERROR","批量操作参数不合法。",422)
    unique_ids=set(media_ids)
    rows=db.session.scalars(db.select(Media).where(Media.id.in_(unique_ids),Media.owner_id==actor.id,Media.deleted_at.is_(None))).all()
    if len(rows)!=len(unique_ids):
        return error_response("RESOURCE_NOT_FOUND","部分媒体不存在。",404)
    if action=="hide" and any(item.bound_type is not None for item in rows):
        return error_response("CONFLICT","已绑定媒体不能批量隐藏，请先解除内容关联。",409)
    for item in rows:
        item.status="hidden" if action=="hide" else "active"
    db.session.commit()
    return success_response({"updated":len(rows),"action":action})


@bp.get("/manage/media/duplicates")
@jwt_required(locations=["headers"])
def owner_media_duplicates():
    actor=current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    hashes=db.session.scalars(db.select(Media.content_sha256).where(
        Media.owner_id==actor.id,
        Media.content_sha256.is_not(None),
        Media.deleted_at.is_(None),
    ).group_by(Media.content_sha256).having(func.count(Media.id)>1)).all()
    rows=db.session.scalars(db.select(Media).where(
        Media.owner_id==actor.id,
        Media.content_sha256.in_(hashes) if hashes else db.false(),
        Media.deleted_at.is_(None),
    ).order_by(Media.content_sha256.asc(),Media.created_at.asc(),Media.id.asc())).all()
    groups={}
    for item in rows:
        groups.setdefault(item.content_sha256,[]).append(item.to_dict(include_manage_paths=True))
    return success_response([{"sha256":key,"items":items} for key,items in groups.items()])
