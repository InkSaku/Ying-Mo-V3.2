const VIEWS = new Set(["overview", "timeline", "media"]);
const TYPES = new Set(["article", "note"]);

function positiveInteger(value, fallback = 1) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function readCollectionMemoryState(params) {
  const rawView = params.get("view") || "overview";
  const rawYear = params.get("year") || "";
  const rawType = params.get("type") || "";
  return {
    view: VIEWS.has(rawView) ? rawView : "overview",
    year: /^\d{4}$/.test(rawYear) ? rawYear : "",
    author: (params.get("author") || "").trim().toLowerCase(),
    type: TYPES.has(rawType) ? rawType : "",
    page: positiveInteger(params.get("page")),
  };
}

export function collectionMemorySearchParams(state) {
  const params = new URLSearchParams();
  if (state.view && state.view !== "overview") params.set("view", state.view);
  if (state.year) params.set("year", state.year);
  if (state.author) params.set("author", state.author);
  if (state.type) params.set("type", state.type);
  if (state.page > 1) params.set("page", String(state.page));
  return params;
}

export function collectionMemoryApiPath(slug, state, pageSize) {
  const params = new URLSearchParams();
  if (state.year) params.set("year", state.year);
  if (state.author) params.set("author", state.author);
  if (state.type) params.set("post_type", state.type);
  params.set("page", String(state.page || 1));
  params.set("page_size", String(pageSize));
  const resource = state.view === "media" ? "media" : "timeline";
  return `/collections/${encodeURIComponent(slug)}/${resource}?${params.toString()}`;
}

export function groupTimelineItems(items) {
  const groups = [];
  for (const item of items || []) {
    if (!item?.semantic_time) continue;
    const date = new Date(item.semantic_time);
    if (Number.isNaN(date.getTime())) continue;
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    let group = groups.find((candidate) => candidate.year === year && candidate.month === month);
    if (!group) {
      group = { year, month, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}
