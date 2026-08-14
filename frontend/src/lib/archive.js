const YEAR_RE = /^\d{4}$/;

function positiveInteger(value, fallback = 1) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function readArchiveSelection(params) {
  const rawYear = params.get("year") || "";
  const year = YEAR_RE.test(rawYear) ? rawYear : "";
  const rawMonth = positiveInteger(params.get("month"), 0);
  const month = year && rawMonth >= 1 && rawMonth <= 12 ? String(rawMonth) : "";
  return {
    year,
    month,
    page: positiveInteger(params.get("page")),
  };
}

export function archiveSearchParams({ year = "", month = "", page = 1 }) {
  const params = new URLSearchParams();
  if (year) params.set("year", String(year));
  if (year && month) params.set("month", String(month));
  if (page > 1) params.set("page", String(page));
  return params;
}

export function archiveApiPath({ year = "", month = "", page = 1 }, pageSize = 20) {
  const route = year
    ? month ? `/archive/${year}/${month}` : `/archive/${year}`
    : "/archive";
  return `${route}?page=${page}&page_size=${pageSize}`;
}

export function groupArchiveFacets(facets = []) {
  const years = new Map();
  for (const facet of facets) {
    const year = Number(facet?.year);
    const month = Number(facet?.month);
    const count = Number(facet?.count) || 0;
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) continue;
    if (!years.has(year)) years.set(year, { year, count: 0, months: [] });
    const group = years.get(year);
    group.count += count;
    group.months.push({ year, month, count });
  }
  return [...years.values()]
    .sort((left, right) => right.year - left.year)
    .map((group) => ({
      ...group,
      months: group.months.sort((left, right) => right.month - left.month),
    }));
}

export function archiveRangeLabel({ year = "", month = "" }) {
  if (!year) return "全部时间";
  if (!month) return `${year} 年`;
  return `${year} 年 ${String(month).padStart(2, "0")} 月`;
}
