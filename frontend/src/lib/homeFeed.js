const FEED_CACHE_TTL_MS = 30 * 60 * 1000;
const feedCache = new Map();
const feedAnchorCache = new Map();

export const HOME_FEED_TYPES = new Set(["all", "note", "article"]);
export const HOME_FEED_SAVE_EVENT = "yingmo:home-feed-save";

export function normalizeHomeFeedType(value) {
  return HOME_FEED_TYPES.has(value) ? value : "all";
}

export function homeFeedPath(type, cursor = "", pageSize = 12) {
  const params = new URLSearchParams({ type: normalizeHomeFeedType(type), page_size: String(pageSize) });
  if (cursor) params.set("cursor", cursor);
  return `/home/feed?${params.toString()}`;
}

export function mergeHomeFeedItems(current, incoming, { prepend = false } = {}) {
  const ordered = prepend ? [...incoming, ...current] : [...current, ...incoming];
  const seen = new Set();
  return ordered.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function homeFeedMemoryInterludeIndex(itemCount, memoryInterlude) {
  if (!memoryInterlude?.items?.length) return -1;
  return Math.min(3, Math.max(0, Number(itemCount) || 0));
}

export function homeFeedCacheKey(userId, type) {
  return `${Number(userId) || "anonymous"}:${normalizeHomeFeedType(type)}`;
}

function pruneHomeFeedMemory(userId) {
  const ownerPrefix = `${Number(userId) || "anonymous"}:`;
  for (const key of feedCache.keys()) {
    if (!key.startsWith(ownerPrefix)) feedCache.delete(key);
  }
  for (const key of feedAnchorCache.keys()) {
    if (!key.startsWith(ownerPrefix)) feedAnchorCache.delete(key);
  }
}

export function readHomeFeedCache(userId, type, now = Date.now()) {
  pruneHomeFeedMemory(userId);
  const key = homeFeedCacheKey(userId, type);
  const cached = feedCache.get(key);
  if (!cached || now - cached.savedAt > FEED_CACHE_TTL_MS) {
    feedCache.delete(key);
    return null;
  }
  return cached.value;
}

export function writeHomeFeedCache(userId, type, value, now = Date.now()) {
  feedCache.set(homeFeedCacheKey(userId, type), { savedAt: now, value });
}

export function captureHomeFeedAnchor(entries, viewportTop = 0) {
  const boundary = Number.isFinite(viewportTop) ? viewportTop : 0;
  const entry = (entries || []).find((item) => (
    Number.isInteger(Number(item?.id))
    && Number(item.id) > 0
    && Number.isFinite(item?.top)
    && Number.isFinite(item?.bottom)
    && item.bottom > boundary
  ));
  return entry ? {
    postId: Number(entry.id),
    offset: Math.round(entry.top - boundary),
  } : null;
}

export function homeFeedAnchorScrollTarget(anchor, { entryTop, viewportTop = 0, scrollY = 0 } = {}) {
  if (!anchor || !Number.isInteger(anchor.postId) || !Number.isFinite(anchor.offset)) return null;
  if (![entryTop, viewportTop, scrollY].every(Number.isFinite)) return null;
  return Math.max(0, Math.round(scrollY + entryTop - viewportTop - anchor.offset));
}

export function readHomeFeedAnchor(userId, type, now = Date.now()) {
  pruneHomeFeedMemory(userId);
  const key = homeFeedCacheKey(userId, type);
  const cached = feedAnchorCache.get(key);
  if (!cached || now - cached.savedAt > FEED_CACHE_TTL_MS) {
    feedAnchorCache.delete(key);
    return null;
  }
  return cached.value;
}

export function writeHomeFeedAnchor(userId, type, anchor, now = Date.now()) {
  if (!anchor || !Number.isInteger(anchor.postId) || anchor.postId < 1 || !Number.isFinite(anchor.offset)) return false;
  feedAnchorCache.set(homeFeedCacheKey(userId, type), {
    savedAt: now,
    value: { postId: anchor.postId, offset: Math.round(anchor.offset) },
  });
  return true;
}

export function homeFeedScrollKey(userId, type) {
  return `yingmo:home-feed-scroll:v1:${Number(userId) || "anonymous"}:${normalizeHomeFeedType(type)}`;
}

export function readHomeFeedScroll(storage, userId, type) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(homeFeedScrollKey(userId, type));
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

export function writeHomeFeedScroll(storage, userId, type, position) {
  if (!storage || !Number.isFinite(position) || position < 0) return false;
  try {
    storage.setItem(homeFeedScrollKey(userId, type), String(Math.round(position)));
    return true;
  } catch {
    return false;
  }
}

export function removeHomeFeedScroll(storage, userId, type) {
  if (!storage) return false;
  try {
    storage.removeItem(homeFeedScrollKey(userId, type));
    return true;
  } catch {
    return false;
  }
}

export function homeFeedDayKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].join("-");
}

export function homeFeedDayLabel(value, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未记录";
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((start.getTime() - target.getTime()) / 86_400_000);
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  if (date.getFullYear() === now.getFullYear()) {
    return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(date);
  }
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(date);
}

export function homeFeedExcerpt(post, limit = 320) {
  const source = post?.feed_excerpt || post?.content_excerpt || post?.summary || post?.body || "";
  const text = String(source)
    .replace(/\[\[ym-media:\d+\]\]/g, " ")
    .replace(/[[\]#>*_`(){}|~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > limit ? `${text.slice(0, limit).trim()}...` : text;
}
