// Private, bounded session memory only. Never persist member content to disk.
export const browsePositions = new Map();
export const commentDrafts = new Map();
export const commentSends = new Map();
export function rememberSessionValue(store, key, value, limit = 40) {
  store.delete(key);
  store.set(key, value);
  if (store.size > limit) store.delete(store.keys().next().value);
}
export function clearMobileSession() {
  browsePositions.clear();
  commentDrafts.clear();
  commentSends.clear();
}

export function trackCommentSend(key, draft, request) {
  const send = { draft, promise: null };
  commentSends.set(key, send);
  send.promise = request.then((result) => {
    if (commentSends.get(key) !== send) return { cancelled: true };
    commentDrafts.delete(key);
    commentSends.delete(key);
    return { result };
  }, (error) => {
    if (commentSends.get(key) !== send) return { cancelled: true };
    rememberSessionValue(commentDrafts, key, draft);
    commentSends.delete(key);
    return { error };
  });
  return send.promise;
}
