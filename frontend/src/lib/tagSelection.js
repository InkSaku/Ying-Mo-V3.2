export function normalizeTagName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}
export function tagKey(value) {
  return normalizeTagName(value).toLowerCase().replace(/ß/g, "ss");
}
export function selectedTagNames(value) {
  const seen = new Set();
  return (Array.isArray(value) ? value : String(value || "").split(/[,，]/))
    .map(normalizeTagName).filter((name) => {
      const key = tagKey(name);
      if (!name || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
