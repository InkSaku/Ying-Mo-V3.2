export const AUTH_INVALIDATION_STORAGE_KEY = "yingmo.auth-invalidation";
const BROADCAST_REASONS = new Set(["LOGOUT", "LOGOUT_ALL", "SESSION_REVOKED", "PASSWORD_RESET"]);

export function shouldPublishAuthInvalidation(reason) {
  return BROADCAST_REASONS.has(reason);
}

export function publishAuthInvalidation(reason, storage) {
  let target = storage;
  try {
    if (target === undefined) target = globalThis.localStorage;
    if (!target || typeof target.setItem !== "function") return false;
    target.setItem(AUTH_INVALIDATION_STORAGE_KEY, JSON.stringify({
      version: 1,
      reason: typeof reason === "string" ? reason.slice(0, 64) : "SESSION_ENDED",
      occurred_at: Date.now(),
    }));
    target.removeItem(AUTH_INVALIDATION_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function authInvalidationReason(event) {
  if (event?.key !== AUTH_INVALIDATION_STORAGE_KEY || !event.newValue) return "";
  try {
    const payload = JSON.parse(event.newValue);
    return payload?.version === 1 && typeof payload.reason === "string"
      ? payload.reason
      : "";
  } catch {
    return "";
  }
}
