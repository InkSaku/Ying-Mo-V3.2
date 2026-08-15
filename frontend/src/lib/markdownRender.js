const TABLE_STRUCTURE_TAGS = new Set(["table", "thead", "tbody", "tr"]);

export function isIgnorableMarkdownWhitespace(value, parentTag) {
  return TABLE_STRUCTURE_TAGS.has(parentTag) && !String(value || "").trim();
}
