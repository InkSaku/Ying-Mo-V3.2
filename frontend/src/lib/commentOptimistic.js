export function insertOptimisticComment(items, comment) {
  if (!comment.parent_id) return [...items, { ...comment, replies: [] }];
  return items.map((root) => root.id === comment.parent_id
    ? { ...root, replies: [...(root.replies || []), comment] }
    : root);
}

export function replaceOptimisticComment(items, temporaryId, saved) {
  return items.map((root) => {
    if (root.id === temporaryId) return { ...saved, replies: saved.replies || [] };
    return {
      ...root,
      replies: (root.replies || []).map((reply) => reply.id === temporaryId ? saved : reply),
    };
  });
}

export function removeOptimisticComment(items, temporaryId) {
  return items
    .filter((root) => root.id !== temporaryId)
    .map((root) => ({
      ...root,
      replies: (root.replies || []).filter((reply) => reply.id !== temporaryId),
    }));
}
