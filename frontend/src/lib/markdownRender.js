const TABLE_STRUCTURE_TAGS = new Set(["table", "thead", "tbody", "tr"]);

export function sameHeadingText(left, right) {
  const normalize = (value) => String(value || "").normalize("NFC").replace(/\s+/gu, " ").trim();
  return Boolean(normalize(right)) && normalize(left) === normalize(right);
}

export function isIgnorableMarkdownWhitespace(value, parentTag) {
  return TABLE_STRUCTURE_TAGS.has(parentTag) && !String(value || "").trim();
}
