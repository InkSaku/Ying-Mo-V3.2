import json
from pathlib import Path
from tempfile import SpooledTemporaryFile
from zipfile import ZIP_DEFLATED, ZipFile

from flask import Blueprint, send_file
from flask_jwt_extended import jwt_required
from sqlalchemy import exists, or_

from app.common.auth import current_user
from app.common.responses import error_response
from app.access import can_read_post, readable_post_predicate
from app.extensions import db
from app.models import (
    Collection, CollectionMember, Comment, CommentMention, CommentReaction,
    ContentFavorite, Media, Notification, Post, PostMemoryLink, PostReaction,
)
from app.posts.service import current_article_slug
from app.storage import get_storage


bp = Blueprint("data", __name__)


def _json_bytes(value):
    return json.dumps(value, ensure_ascii=False, indent=2, default=str).encode("utf-8")


def _safe_filename(value, fallback):
    name = Path(value or fallback).name.replace("/", "-").replace("\\", "-")
    return name[:180] or fallback


@bp.get("/export")
@jwt_required(locations=["headers"])
def export_my_data():
    actor = current_user()
    if actor is None:
        return error_response("ACCOUNT_RESTRICTED", "当前账号无法继续使用。", 403)

    posts = db.session.scalars(db.select(Post).where(
        Post.author_id == actor.id,
        Post.deleted_at.is_(None),
    ).order_by(Post.created_at.asc(), Post.id.asc())).all()
    collections = db.session.scalars(db.select(Collection).where(
        Collection.deleted_at.is_(None),
        or_(
            Collection.creator_id == actor.id,
            exists().where(
                CollectionMember.collection_id == Collection.id,
                CollectionMember.user_id == actor.id,
            ),
        ),
    ).order_by(Collection.id.asc())).all()
    comments = db.session.scalars(db.select(Comment).where(
        Comment.author_id == actor.id,
    ).order_by(Comment.id.asc())).all()
    favorite_ids = list(db.session.scalars(db.select(ContentFavorite.post_id).join(
        Post,Post.id==ContentFavorite.post_id,
    ).where(
        ContentFavorite.user_id == actor.id,readable_post_predicate(actor.id),
    ).order_by(ContentFavorite.post_id.asc())).all())
    post_reactions = db.session.scalars(db.select(PostReaction).join(
        Post,Post.id==PostReaction.post_id,
    ).where(
        PostReaction.user_id == actor.id,readable_post_predicate(actor.id),
    ).order_by(PostReaction.id.asc())).all()
    comment_reactions = db.session.scalars(db.select(CommentReaction).join(
        Comment,Comment.id==CommentReaction.comment_id,
    ).join(Post,Post.id==Comment.post_id).where(
        CommentReaction.user_id == actor.id,Comment.status=="active",
        readable_post_predicate(actor.id),
    ).order_by(CommentReaction.id.asc())).all()
    mentions = db.session.scalars(db.select(CommentMention).join(
        Comment,Comment.id==CommentMention.comment_id,
    ).join(Post,Post.id==Comment.post_id).where(
        CommentMention.user_id == actor.id,Comment.status=="active",
        readable_post_predicate(actor.id),
    ).order_by(CommentMention.id.asc())).all()
    notifications = db.session.scalars(db.select(Notification).where(
        Notification.user_id == actor.id,
    ).order_by(Notification.id.asc())).all()
    media = db.session.scalars(db.select(Media).where(
        Media.owner_id == actor.id,
        Media.deleted_at.is_(None),
    ).order_by(Media.id.asc())).all()
    memory_links = [
        item for item in db.session.scalars(
            db.select(PostMemoryLink).where(
                PostMemoryLink.author_id == actor.id,
                PostMemoryLink.invalidated_at.is_(None),
                PostMemoryLink.detached_at.is_(None),
            ).order_by(PostMemoryLink.id.asc())
        ).all()
        if can_read_post(actor.id, item.root_post, include_archived=True)
        and can_read_post(actor.id, item.contribution_post, include_archived=True)
    ]

    archive = SpooledTemporaryFile(max_size=8 * 1024 * 1024, mode="w+b")
    with ZipFile(archive, "w", compression=ZIP_DEFLATED) as bundle:
        manifest = {
            "format": "ying-mo-member-export",
            "version": 1,
            "user": actor.self_dict(),
            "counts": {
                "posts": len(posts),
                "collections": len(collections),
                "comments": len(comments),
                "favorites": len(favorite_ids),
                "post_reactions": len(post_reactions),
                "comment_reactions": len(comment_reactions),
                "mentions_received": len(mentions),
                "notifications": len(notifications),
                "media": len(media),
                "memory_links": len(memory_links),
            },
        }
        bundle.writestr("manifest.json", _json_bytes(manifest))
        bundle.writestr("collections.json", _json_bytes([
            {**item.to_dict(include_members=True), "relationship": "creator" if item.creator_id == actor.id else "member"}
            for item in collections
        ]))
        bundle.writestr("comments.json", _json_bytes([{
            "id": item.id,
            "post_id": item.post_id,
            "body": item.body,
            "status": item.status,
            "created_at": item.created_at,
        } for item in comments]))
        bundle.writestr("favorites.json", _json_bytes({"post_ids": favorite_ids}))
        bundle.writestr("interactions.json", _json_bytes({
            "post_reactions": [{
                "post_id": item.post_id, "kind": item.kind, "created_at": item.created_at,
            } for item in post_reactions],
            "comment_reactions": [{
                "comment_id": item.comment_id, "kind": item.kind, "created_at": item.created_at,
            } for item in comment_reactions],
            "mentions_received": [{
                "comment_id": item.comment_id, "created_at": item.created_at,
            } for item in mentions],
        }))
        bundle.writestr("notifications.json", _json_bytes([item.to_dict() for item in notifications]))
        bundle.writestr("memory_links.json", _json_bytes({
            "version": 1,
            "items": [{
                "root_post_id": item.root_post_id,
                "contribution_post_id": item.contribution_post_id,
                "collection_id": item.collection_id,
                "created_at": item.created_at,
            } for item in memory_links],
        }))
        for post in posts:
            slug = current_article_slug(post.id) if post.post_type == "article" else None
            title = post.title or f"note-{post.id}"
            frontmatter = {
                "id": post.id,
                "type": post.post_type,
                "title": post.title,
                "slug": slug,
                "status": post.status,
                "visibility": post.visibility,
                "collection_id": post.collection_id,
                "published_at": post.published_at,
                "occurred_at": post.occurred_at,
                "location": post.location,
                "mood": post.mood,
                "created_at": post.created_at,
                "updated_at": post.updated_at,
            }
            markdown = "---\n" + json.dumps(frontmatter, ensure_ascii=False, indent=2, default=str) + "\n---\n\n" + (post.body or "")
            bundle.writestr(
                f"posts/{post.id}-{_safe_filename(slug or title, str(post.id))}.md",
                markdown.encode("utf-8"),
            )
        storage = get_storage()
        media_manifest = []
        for item in media:
            data = item.to_dict(include_manage_paths=True)
            filename = f"{item.id}-{_safe_filename(item.original_filename, item.public_id)}"
            data["archive_path"] = None
            if storage.exists(item.storage_key):
                path = f"media/{filename}"
                bundle.writestr(path, storage.read(item.storage_key))
                data["archive_path"] = path
            media_manifest.append(data)
        bundle.writestr("media.json", _json_bytes(media_manifest))
    archive.seek(0)
    response = send_file(
        archive,
        mimetype="application/zip",
        as_attachment=True,
        download_name=f"ying-mo-{actor.username}-export.zip",
        max_age=0,
    )
    response.call_on_close(archive.close)
    return response
