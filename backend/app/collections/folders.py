"""合集目录树。

目录只决定内容放在哪一层：不改变 Collection ACL，不改写正文，也不增加 Post 的编辑版本，
否则别人挪动一条内容会让作者正在进行的保存报冲突。结构变更先锁 Collection，避免并发形成环或同名。
"""
from itertools import count

from app.access import is_collection_member
from app.common.time import isoformat_utc
from app.extensions import db
from app.models import Collection, CollectionFolder, Post
from app.posts.service import DomainError

MAX_FOLDER_DEPTH = 5
MAX_FOLDERS_PER_COLLECTION = 500
MAX_FOLDER_NAME_LENGTH = 80
MAX_MOVE_BATCH = 200


def _not_found():
    return DomainError("RESOURCE_NOT_FOUND", "目录不存在。", 404)


def locked_member_collection(collection_id, actor_id):
    collection = db.session.scalar(
        db.select(Collection).where(Collection.id == collection_id).with_for_update()
    )
    if not is_collection_member(actor_id, collection):
        raise DomainError("RESOURCE_NOT_FOUND", "Collection 不存在。", 404)
    return collection


def load_folders(collection_id, *, lock=False):
    statement = (
        db.select(CollectionFolder).where(CollectionFolder.collection_id == collection_id)
        .order_by(CollectionFolder.sort_order.asc(), CollectionFolder.id.asc())
    )
    if lock:
        # MySQL 普通读沿用事务内第一次读建立的快照（JWT 校验时已建立），
        # 等到 Collection 锁后仍看不到对方刚提交的目录，结构变更必须用加锁读。
        statement = statement.with_for_update()
    return list(db.session.scalars(statement).all())


def can_manage_folder(actor_id, collection, folder):
    return actor_id in {collection.creator_id, folder.created_by_id}


def serialize_folder(folder, actor_id, collection):
    return {
        "id": folder.id,
        "parent_id": folder.parent_id,
        "name": folder.name,
        "sort_order": folder.sort_order,
        "can_manage": can_manage_folder(actor_id, collection, folder),
        "created_at": isoformat_utc(folder.created_at),
    }


def folder_path(collection_id, folder_id):
    """从第一层到当前目录的 [{id, name}]；目录已失效时视为根目录。"""
    if folder_id is None or collection_id is None:
        return []
    by_id = {folder.id: folder for folder in load_folders(collection_id)}
    return [{"id": folder.id, "name": folder.name} for folder in _ancestors(by_id, folder_id)]


def folder_name_paths(collection_ids):
    """批量返回 {folder_id: [目录名...]}，调用方负责只传入当前用户可读的 Collection。"""
    if not collection_ids:
        return {}
    folders = db.session.scalars(
        db.select(CollectionFolder).where(CollectionFolder.collection_id.in_(collection_ids))
    ).all()
    by_id = {folder.id: folder for folder in folders}
    return {
        folder.id: [item.name for item in _ancestors(by_id, folder.id)]
        for folder in folders
    }


def _ancestors(by_id, folder_id):
    path = []
    seen = set()
    current = by_id.get(folder_id)
    while current is not None and current.id not in seen:
        seen.add(current.id)
        path.append(current)
        current = by_id.get(current.parent_id)
    path.reverse()
    return path


def _subtree_height(folders, folder_id):
    children = [folder for folder in folders if folder.parent_id == folder_id]
    return 1 + max((_subtree_height(folders, child.id) for child in children), default=0)


def _subtree_ids(folders, folder_id):
    ids = {folder_id}
    for folder in folders:
        if folder.parent_id == folder_id:
            ids |= _subtree_ids(folders, folder.id)
    return ids


def _optional_id(value, field):
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise DomainError("VALIDATION_ERROR", f"{field} 不合法。", 422)
    return value


def _clean_name(value):
    if not isinstance(value, str):
        raise DomainError("VALIDATION_ERROR", "请填写目录名称。", 422)
    name = " ".join(value.split())
    if not name:
        raise DomainError("VALIDATION_ERROR", "请填写目录名称。", 422)
    if len(name) > MAX_FOLDER_NAME_LENGTH:
        raise DomainError("VALIDATION_ERROR", f"目录名称最多 {MAX_FOLDER_NAME_LENGTH} 个字。", 422)
    return name


def _siblings(folders, parent_id, *, exclude_id=None):
    return [folder for folder in folders if folder.parent_id == parent_id and folder.id != exclude_id]


def _ensure_name_free(folders, parent_id, name, *, exclude_id=None):
    if any(folder.name.casefold() == name.casefold() for folder in _siblings(folders, parent_id, exclude_id=exclude_id)):
        raise DomainError("COLLECTION_FOLDER_NAME_TAKEN", "这一层已经有同名目录。", 409)


def _next_sort_order(folders, parent_id, *, exclude_id=None):
    return 1 + max((folder.sort_order for folder in _siblings(folders, parent_id, exclude_id=exclude_id)), default=-1)


def _available_name(name, taken):
    if name.casefold() not in taken:
        return name
    for number in count(2):
        suffix = f" {number}"
        candidate = f"{name[:MAX_FOLDER_NAME_LENGTH - len(suffix)]}{suffix}"
        if candidate.casefold() not in taken:
            return candidate


def _resolve_parent(folders, parent_id):
    parent_id = _optional_id(parent_id, "parent_id")
    if parent_id is None:
        return None
    parent = next((folder for folder in folders if folder.id == parent_id), None)
    if parent is None:
        raise _not_found()
    return parent


def _depth_of(folders, folder):
    if folder is None:
        return 0
    return len(_ancestors({item.id: item for item in folders}, folder.id))


def _require_folder(folders, folder_id):
    folder = next((item for item in folders if item.id == folder_id), None)
    if folder is None:
        raise _not_found()
    return folder


def _require_manager(actor_id, collection, folder):
    if not can_manage_folder(actor_id, collection, folder):
        raise DomainError("PERMISSION_DENIED", "只有目录创建人或合集创建者可以修改这个目录。", 403)


def create_folder(collection, actor_id, name, parent_id):
    folders = load_folders(collection.id, lock=True)
    if len(folders) >= MAX_FOLDERS_PER_COLLECTION:
        raise DomainError("COLLECTION_FOLDER_LIMIT", "这个合集的目录已经太多了。", 409)
    parent = _resolve_parent(folders, parent_id)
    if _depth_of(folders, parent) + 1 > MAX_FOLDER_DEPTH:
        raise DomainError("COLLECTION_FOLDER_TOO_DEEP", f"目录最多 {MAX_FOLDER_DEPTH} 层。", 409)
    resolved_parent_id = parent.id if parent else None
    name = _clean_name(name)
    _ensure_name_free(folders, resolved_parent_id, name)
    folder = CollectionFolder(
        collection_id=collection.id,
        parent_id=resolved_parent_id,
        name=name,
        sort_order=_next_sort_order(folders, resolved_parent_id),
        created_by_id=actor_id,
    )
    db.session.add(folder)
    db.session.flush()
    return folder


def update_folder(collection, actor_id, folder_id, data):
    unknown = sorted(set(data) - {"name", "parent_id"})
    if unknown:
        raise DomainError("VALIDATION_ERROR", "包含不支持的字段。", 422, [{"fields": unknown}])
    folders = load_folders(collection.id, lock=True)
    folder = _require_folder(folders, folder_id)
    _require_manager(actor_id, collection, folder)

    name = _clean_name(data["name"]) if "name" in data else folder.name
    parent_id = folder.parent_id
    if "parent_id" in data:
        parent = _resolve_parent(folders, data["parent_id"])
        parent_id = parent.id if parent else None
        if parent_id != folder.parent_id:
            if parent_id in _subtree_ids(folders, folder.id):
                raise DomainError("COLLECTION_FOLDER_CYCLE", "不能把目录移动到它自己里面。", 409)
            if _depth_of(folders, parent) + _subtree_height(folders, folder.id) > MAX_FOLDER_DEPTH:
                raise DomainError("COLLECTION_FOLDER_TOO_DEEP", f"目录最多 {MAX_FOLDER_DEPTH} 层。", 409)

    if name.casefold() != folder.name.casefold() or parent_id != folder.parent_id:
        _ensure_name_free(folders, parent_id, name, exclude_id=folder.id)
    if parent_id != folder.parent_id:
        folder.sort_order = _next_sort_order(folders, parent_id, exclude_id=folder.id)
        folder.parent_id = parent_id
    folder.name = name
    db.session.flush()
    return folder


def _place_posts(condition, folder_id):
    return db.session.execute(
        db.update(Post).where(condition).values(
            collection_folder_id=folder_id,
            collection_sort_order=None,
            updated_at=Post.updated_at,
        ).execution_options(synchronize_session=False)
    ).rowcount


def delete_folder(collection, actor_id, folder_id):
    """删除目录本身；子目录和内容整体上移一级，任何 Post 都不会被删除。"""
    folders = load_folders(collection.id, lock=True)
    folder = _require_folder(folders, folder_id)
    _require_manager(actor_id, collection, folder)

    parent_id = folder.parent_id
    children = [item for item in folders if item.parent_id == folder.id]
    taken = {item.name.casefold() for item in _siblings(folders, parent_id, exclude_id=folder.id)}
    order = _next_sort_order(folders, parent_id, exclude_id=folder.id)
    for child in children:
        child.name = _available_name(child.name, taken)
        taken.add(child.name.casefold())
        child.parent_id = parent_id
        child.sort_order = order
        order += 1
    db.session.flush()
    moved_posts = _place_posts(Post.collection_folder_id == folder.id, parent_id)
    db.session.delete(folder)
    db.session.flush()
    return {"parent_id": parent_id, "moved_folders": len(children), "moved_posts": moved_posts}


def reorder_folders(collection, parent_id, folder_ids):
    if (
        not isinstance(folder_ids, list)
        or any(isinstance(item, bool) or not isinstance(item, int) for item in folder_ids)
        or len(folder_ids) != len(set(folder_ids))
    ):
        raise DomainError("VALIDATION_ERROR", "folder_ids 必须是无重复数组。", 422)
    folders = load_folders(collection.id, lock=True)
    parent = _resolve_parent(folders, parent_id)
    siblings = _siblings(folders, parent.id if parent else None)
    if set(folder_ids) != {folder.id for folder in siblings}:
        raise DomainError("VALIDATION_ERROR", "folder_ids 必须完整覆盖这一层的目录。", 422)
    order = {folder_id: index for index, folder_id in enumerate(folder_ids)}
    for folder in siblings:
        folder.sort_order = order[folder.id]
    db.session.flush()


def resolve_folder_id(collection, folder_id):
    """校验 folder_id 属于该 Collection，返回规范化后的 id（None 表示根目录）。"""
    folder_id = _optional_id(folder_id, "folder_id")
    if folder_id is None:
        return None
    # 同样要读到最新状态：目录刚被删除时返回 404，而不是之后写外键失败。
    folder = db.session.get(CollectionFolder, folder_id, with_for_update=True)
    if folder is None or folder.collection_id != collection.id:
        raise _not_found()
    return folder.id


def move_posts(collection, posts, folder_id):
    """目录校验失败时整批不动；和单条移动一样不算编辑。"""
    target = resolve_folder_id(collection, folder_id)
    changed = [post for post in posts if post.collection_folder_id != target]
    if changed:
        _place_posts(Post.id.in_([post.id for post in changed]), target)
        for post in changed:
            db.session.expire(post)
    return target


def move_post(collection, post, folder_id):
    return move_posts(collection, [post], folder_id)


def set_post_order(post_ids):
    """手动排序同样不算编辑正文，不增加编辑版本，也不刷新“更新于”。"""
    for index, post_id in enumerate(post_ids):
        db.session.execute(
            db.update(Post).where(Post.id == post_id).values(
                collection_sort_order=index,
                updated_at=Post.updated_at,
            ).execution_options(synchronize_session=False)
        )
