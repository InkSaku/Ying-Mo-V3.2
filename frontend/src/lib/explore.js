const SEED_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function normalizeExploreSeed(value) {
  const seed = typeof value === "string" ? value.trim() : "";
  return SEED_RE.test(seed) ? seed : "";
}

export function exploreApiPath(seed) {
  const normalized = normalizeExploreSeed(seed);
  return normalized ? `/explore?seed=${encodeURIComponent(normalized)}` : "/explore";
}

export function createExploreSeed(timestamp = Date.now()) {
  return `batch-${Math.max(0, Number(timestamp) || 0).toString(36)}`;
}
