const SORTS = new Set(["newest", "oldest", "updated"]);

function positiveInteger(value, fallback = 1) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function cleanToken(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function readPostFilters(params, type = "") {
  const rawSort = params.get("sort") || "newest";
  return {
    author: cleanToken(params.get("author")),
    category: type === "note" ? "" : cleanToken(params.get("category")),
    tag: cleanToken(params.get("tag")),
    collection: cleanToken(params.get("collection")),
    sort: SORTS.has(rawSort) ? rawSort : "newest",
    page: positiveInteger(params.get("page")),
  };
}

export function postFilterSearchParams(filters, { includeSort = true } = {}) {
  const params = new URLSearchParams();
  for (const key of ["author", "category", "tag", "collection"]) {
    if (filters[key]) params.set(key, filters[key]);
  }
  if (includeSort && filters.sort && filters.sort !== "newest") params.set("sort", filters.sort);
  if (filters.page > 1) params.set("page", String(filters.page));
  return params;
}

export function postsApiPath(type, filters, pageSize = 12) {
  const params = postFilterSearchParams(filters);
  params.set("post_type", type);
  params.set("sort", filters.sort || "newest");
  params.set("page", String(filters.page || 1));
  params.set("page_size", String(pageSize));
  return `/posts?${params.toString()}`;
}

export function hasActivePostFilters(filters) {
  return ["author", "category", "tag", "collection"].some((key) => Boolean(filters[key]));
}
