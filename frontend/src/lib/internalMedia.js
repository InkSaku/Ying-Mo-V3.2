const INTERNAL_MEDIA_RE = /\[\[ym-media:(\d+)\]\]/g;

export function mediaPlaceholder(mediaId) {
  const id = Number.parseInt(mediaId, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new TypeError("mediaId must be a positive integer");
  }
  return `[[ym-media:${id}]]`;
}

export function mediaIdsInMarkdown(value) {
  const ids = new Set();
  const source = String(value || "");
  INTERNAL_MEDIA_RE.lastIndex = 0;
  let match;
  while ((match = INTERNAL_MEDIA_RE.exec(source))) {
    ids.add(Number(match[1]));
  }
  INTERNAL_MEDIA_RE.lastIndex = 0;
  return ids;
}

export function removeMediaPlaceholders(value, mediaIds) {
  const ids = new Set(Array.from(mediaIds || [], (item) => Number(item)));
  if (!ids.size) return String(value || "");
  INTERNAL_MEDIA_RE.lastIndex = 0;
  const result = String(value || "").replace(INTERNAL_MEDIA_RE, (token, rawId) => (
    ids.has(Number(rawId)) ? "" : token
  ));
  INTERNAL_MEDIA_RE.lastIndex = 0;
  return result;
}

function lineBreakBefore(value) {
  if (!value) return "";
  if (value.endsWith("\n\n")) return "";
  if (value.endsWith("\n")) return "\n";
  return "\n\n";
}

function lineBreakAfter(value) {
  if (!value) return "";
  if (value.startsWith("\n\n")) return "";
  if (value.startsWith("\n")) return "\n";
  return "\n\n";
}

export function insertMediaPlaceholder(value, mediaId, start, end = start) {
  const source = String(value || "");
  const safeStart = Math.max(0, Math.min(Number.isInteger(start) ? start : source.length, source.length));
  const safeEnd = Math.max(safeStart, Math.min(Number.isInteger(end) ? end : safeStart, source.length));
  const before = source.slice(0, safeStart);
  const after = source.slice(safeEnd);
  const insertion = `${lineBreakBefore(before)}${mediaPlaceholder(mediaId)}${lineBreakAfter(after)}`;
  return {
    value: `${before}${insertion}${after}`,
    cursor: before.length + insertion.length,
  };
}
