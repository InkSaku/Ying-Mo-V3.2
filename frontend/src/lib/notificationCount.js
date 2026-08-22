export function normalizeUnreadCount(value) {
  const count = Number(value);
  return Number.isSafeInteger(count) && count > 0 ? count : 0;
}

export function unreadBadgeText(value) {
  const count = normalizeUnreadCount(value);
  if (!count) return "";
  return count > 99 ? "99+" : String(count);
}

export function newNotificationDelta(previous, next, initialized = true) {
  if (!initialized) return 0;
  return Math.max(0, normalizeUnreadCount(next) - normalizeUnreadCount(previous));
}
