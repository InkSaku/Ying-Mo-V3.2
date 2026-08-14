from io import BytesIO
import uuid

from flask import Blueprint, current_app, request, send_file
from flask_jwt_extended import jwt_required
from PIL import Image, UnidentifiedImageError

from app.access import can_read_post, is_collection_member
from app.common.auth import current_user
from app.common.markdown import remove_media_placeholders
from app.common.responses import error_response, success_response
from app.extensions import db, limiter
from app.models import Collection, Media, Post, User
from app.storage import get_storage

bp=Blueprint("uploads",__name__)
ALLOWED_FORMATS={"JPEG":("image/jpeg",".jpg"),"PNG":("image/png",".png"),"WEBP":("image/webp",".webp")}


def _paths(public_id,ext):
    return f"images/{public_id}{ext}",f"thumbnails/{public_id}.webp"


def _video_path(public_id,ext):
    return f"live-photo-videos/{public_id}{ext}"


def _read_image(file):
    raw=file.read(current_app.config["IMAGE_MAX_BYTES"]+1)
    if len(raw)>current_app.config["IMAGE_MAX_BYTES"]:
        raise ValueError("too_large")
    try:
        probe=Image.open(BytesIO(raw)); fmt=probe.format; probe.verify()
        if fmt not in ALLOWED_FORMATS:
            raise ValueError("unsupported")
        image=Image.open(BytesIO(raw)); image.load()
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


def _write_image_files(raw,image,fmt,public_id):
    mime,ext=ALLOWED_FORMATS[fmt]
    original,thumb=_paths(public_id,ext)
    get_storage().put(original,raw,mime)
    thumbnail=image.copy(); thumbnail.thumbnail((640,640))
    if thumbnail.mode not in ("RGB","RGBA"):
        thumbnail=thumbnail.convert("RGB")
    buffer=BytesIO(); thumbnail.save(buffer,"WEBP",quality=82,method=6)
    get_storage().put(thumb,buffer.getvalue(),"image/webp")
    return mime,original,thumb


def _can_read(actor,media):
    if media.status!="active" or media.deleted_at is not None:
        return False
    if media.owner_id==actor.id and media.bound_type is None:
        return True
    if media.bound_type=="avatar":
        return True
    if media.bound_type=="post":
        return can_read_post(actor.id,db.session.get(Post,media.bound_id))
    if media.bound_type=="collection":
        return is_collection_member(actor.id,db.session.get(Collection,media.bound_id))
    return media.owner_id==actor.id


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
    mime,original,thumb=_write_image_files(raw,image,fmt,public_id)
    media=Media(
        public_id=public_id,owner_id=actor.id,kind="image",mime_type=mime,
        byte_size=len(raw),width=image.width,height=image.height,
        storage_key=original,thumbnail_key=thumb,
    )
    db.session.add(media); db.session.commit()
    return success_response(media.to_dict(),201)


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
    image_mime,image_path,thumb_path=_write_image_files(image_raw,image_obj,image_fmt,image_public_id)
    video_path=_video_path(video_public_id,video_ext); get_storage().put(video_path,video_raw,video_mime)
    image_media=Media(
        public_id=image_public_id,owner_id=actor.id,kind="live_photo_image",mime_type=image_mime,
        byte_size=len(image_raw),width=image_obj.width,height=image_obj.height,
        storage_key=image_path,thumbnail_key=thumb_path,
        live_photo_pair_id=pair_id,
    )
    video_media=Media(
        public_id=video_public_id,owner_id=actor.id,kind="live_photo_video",mime_type=video_mime,
        byte_size=len(video_raw),storage_key=video_path,
        live_photo_pair_id=pair_id,
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
    if len(items)!=2 or any(not _can_read(actor,item) for item in items):
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
    if media is None or not _can_read(actor,media):
        return error_response("RESOURCE_NOT_FOUND","媒体不存在。",404)
    storage=get_storage()
    if not storage.exists(media.storage_key):
        return error_response("RESOURCE_NOT_FOUND","媒体文件不存在。",404)
    return send_file(BytesIO(storage.read(media.storage_key)),mimetype=media.mime_type,conditional=False,max_age=0)


@bp.get("/images/<public_id>/thumbnail")
@jwt_required(locations=["headers"])
def thumbnail(public_id):
    actor=current_user(); media=db.session.scalar(db.select(Media).where(Media.public_id==public_id))
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    if media is None or media.kind=="live_photo_video" or not _can_read(actor,media):
        return error_response("RESOURCE_NOT_FOUND","媒体不存在。",404)
    storage=get_storage(); key=media.thumbnail_key or media.storage_key
    if not storage.exists(key):
        return error_response("RESOURCE_NOT_FOUND","媒体文件不存在。",404)
    return send_file(BytesIO(storage.read(key)),mimetype="image/webp" if media.thumbnail_key else media.mime_type,conditional=False,max_age=0)


@bp.get("/manage/images/<public_id>")
@jwt_required(locations=["headers"])
def owner_image(public_id):
    actor=current_user(); media=db.session.scalar(db.select(Media).where(Media.public_id==public_id))
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED","当前账号无法继续使用。",403)
    if media is None or media.owner_id != actor.id:
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
    if media is None or media.owner_id != actor.id:
        return error_response("RESOURCE_NOT_FOUND","媒体不存在。",404)
    storage=get_storage(); key=media.thumbnail_key or media.storage_key
    if not storage.exists(key):
        return error_response("RESOURCE_NOT_FOUND","媒体文件不存在。",404)
    return send_file(BytesIO(storage.read(key)),mimetype="image/webp" if media.thumbnail_key else media.mime_type,conditional=False,max_age=0)
