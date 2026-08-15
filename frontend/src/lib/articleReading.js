const MIN_TOC_LEVEL = 2;
const MAX_TOC_LEVEL = 4;

export function normalizeArticleOutline(outline) {
  const seen = new Set();
  const normalized = [];
  for (const item of Array.isArray(outline) ? outline : []) {
    const id = typeof item?.id === "string" ? item.id.trim() : "";
    const label = typeof item?.label === "string" ? item.label.trim() : "";
    const level = Number(item?.level);
    if (!id || !label || !Number.isInteger(level) || level < MIN_TOC_LEVEL || level > MAX_TOC_LEVEL || seen.has(id)) {
      continue;
    }
    seen.add(id);
    normalized.push({ id, label, level });
  }
  return normalized;
}

export function hasArticleToc(outline) {
  return Array.isArray(outline) && outline.length >= 2;
}

export function calculateReadingProgress({ scrollTop, contentTop, contentHeight, viewportHeight }) {
  const start = Number(contentTop) || 0;
  const end = start + Math.max(0, Number(contentHeight) || 0) - Math.max(0, Number(viewportHeight) || 0);
  if (end <= start) return Number(scrollTop) >= start ? 100 : 0;
  const ratio = (Number(scrollTop) - start) / (end - start);
  return Math.min(100, Math.max(0, ratio * 100));
}

export function activeHeadingAt(positions, threshold) {
  const valid = (Array.isArray(positions) ? positions : []).filter((item) => (
    item && typeof item.id === "string" && Number.isFinite(item.top)
  ));
  if (!valid.length) return "";
  let active = valid[0].id;
  for (const item of valid) {
    if (item.top > threshold) break;
    active = item.id;
  }
  return active;
}
