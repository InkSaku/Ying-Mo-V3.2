export const MAX_FOLDER_DEPTH = 5;

function compareFolders(a, b) {
  return (a.sort_order - b.sort_order) || (a.id - b.id);
}

export function buildFolderIndex(folders = []) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const children = new Map();
  for (const folder of folders) {
    const parent = byId.has(folder.parent_id) ? folder.parent_id : null;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(folder);
  }
  for (const level of children.values()) level.sort(compareFolders);
  return { byId, children };
}

export function childFolders(index, parentId) {
  return index.children.get(parentId ?? null) || [];
}

// 从第一层到当前目录；传入的目录不存在时返回空数组，等同合集根目录。
export function folderPath(index, folderId) {
  const path = [];
  const seen = new Set();
  let current = index.byId.get(folderId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = index.byId.get(current.parent_id);
  }
  return path;
}

export function subtreeIds(index, folderId) {
  const ids = new Set([folderId]);
  for (const child of childFolders(index, folderId)) {
    for (const id of subtreeIds(index, child.id)) ids.add(id);
  }
  return ids;
}

export function subtreeHeight(index, folderId) {
  return 1 + Math.max(0, ...childFolders(index, folderId).map((child) => subtreeHeight(index, child.id)));
}

// 按树的先序展开，供选择目录时使用。
export function flattenFolders(index, parentId = null, depth = 1) {
  return childFolders(index, parentId).flatMap((folder) => [
    { folder, depth },
    ...flattenFolders(index, folder.id, depth + 1),
  ]);
}

export function folderPathLabel(index, folderId) {
  return folderPath(index, folderId).map((folder) => folder.name).join(" / ");
}

// 目录已失效的内容按根目录显示，避免从目录树里消失。
export function postsInFolder(posts, index, folderId) {
  return (posts || []).filter((post) => {
    const placed = index.byId.has(post.collection_folder_id) ? post.collection_folder_id : null;
    return placed === (folderId ?? null);
  });
}

export function collectionFolderHref(slug, folderId) {
  const path = `/collections/${encodeURIComponent(slug)}`;
  return folderId ? `${path}?folder=${folderId}` : path;
}
