export const OFFLINE_DRAFT_VERSION = 1;

export function offlineDraftKey(userId, postId, type = "article", collectionId = "") {
  const owner = Number.isSafeInteger(Number(userId)) && Number(userId) > 0 ? Number(userId) : "anonymous";
  const target = postId ? `post:${postId}` : `new:${type}:${collectionId || "none"}`;
  return `yingmo:offline-draft:v${OFFLINE_DRAFT_VERSION}:${owner}:${target}`;
}

export function writeOfflineDraft(storage, key, form, savedAt = new Date()) {
  if (!storage || !key || !form) return false;
  try {
    storage.setItem(key, JSON.stringify({
      version: OFFLINE_DRAFT_VERSION,
      saved_at: savedAt.toISOString(),
      form,
    }));
    return true;
  } catch {
    return false;
  }
}

export function readOfflineDraft(storage, key) {
  if (!storage || !key) return null;
  try {
    const parsed = JSON.parse(storage.getItem(key) || "null");
    if (parsed?.version !== OFFLINE_DRAFT_VERSION || !parsed.form || typeof parsed.saved_at !== "string") return null;
    if (Number.isNaN(new Date(parsed.saved_at).getTime())) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function removeOfflineDraft(storage, key) {
  if (!storage || !key) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
