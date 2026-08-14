const USER_STATUSES = new Set(["active", "banned", "deactivated"]);
const USER_ROLES = new Set(["user", "system_admin"]);
const POST_TYPES = new Set(["article", "note"]);
const POST_STATUSES = new Set(["draft", "published", "archived"]);
const POST_VISIBILITIES = new Set(["login_only", "private"]);
const MODERATION_STATUSES = new Set(["active", "hidden"]);
const COMMENT_STATUSES = new Set(["active", "hidden", "deleted"]);
const TAXONOMY_STATUSES = new Set(["active", "inactive"]);
const MEDIA_KINDS = new Set(["image", "live_photo"]);
const MEDIA_STATUSES = new Set(["active", "hidden"]);
const MEDIA_BOUND_TYPES = new Set(["post", "collection", "avatar", "unbound"]);

function positivePage(value) {
  const parsed = Number.parseInt(value || "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function positiveId(value) {
  const normalized = (value || "").trim();
  return /^\d+$/.test(normalized) && Number(normalized) > 0 ? normalized : "";
}

function appendPage(params, page) {
  if (page > 1) params.set("page", String(page));
  return params;
}

export function readAdminUserFilters(params) {
  const status = params.get("status") || "";
  const role = params.get("role") || "";
  return {
    q: (params.get("q") || "").trim().slice(0, 100),
    status: USER_STATUSES.has(status) ? status : "",
    role: USER_ROLES.has(role) ? role : "",
    page: positivePage(params.get("page")),
  };
}

export function adminUserSearchParams({ q = "", status = "", role = "", page = 1 }) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (role) params.set("role", role);
  if (page > 1) params.set("page", String(page));
  return params;
}

export function adminUsersApiPath(filters, pageSize = 20) {
  const params = adminUserSearchParams(filters);
  params.set("page", String(filters.page || 1));
  params.set("page_size", String(pageSize));
  return `/admin/users?${params}`;
}

export function readAdminPostFilters(params) {
  const postType = params.get("post_type") || "";
  const status = params.get("status") || "";
  const visibility = params.get("visibility") || "";
  const moderationStatus = params.get("moderation_status") || "";
  return {
    q: (params.get("q") || "").trim().slice(0, 100),
    post_type: POST_TYPES.has(postType) ? postType : "",
    status: POST_STATUSES.has(status) ? status : "",
    visibility: POST_VISIBILITIES.has(visibility) ? visibility : "",
    moderation_status: MODERATION_STATUSES.has(moderationStatus) ? moderationStatus : "",
    author_id: positiveId(params.get("author_id")),
    category_id: positiveId(params.get("category_id")),
    tag_id: positiveId(params.get("tag_id")),
    collection_id: positiveId(params.get("collection_id")),
    page: positivePage(params.get("page")),
  };
}

export function adminPostSearchParams(filters) {
  const params = new URLSearchParams();
  ["q", "post_type", "status", "visibility", "moderation_status", "author_id", "category_id", "tag_id", "collection_id"]
    .forEach((key) => { if (filters[key]) params.set(key, filters[key]); });
  return appendPage(params, filters.page || 1);
}

export function adminPostsApiPath(filters, pageSize = 20) {
  const params = adminPostSearchParams(filters);
  params.set("page", String(filters.page || 1));
  params.set("page_size", String(pageSize));
  return `/admin/posts?${params}`;
}

export function readAdminCollectionFilters(params) {
  const status = params.get("status") || "";
  return {
    q: (params.get("q") || "").trim().slice(0, 100),
    status: MODERATION_STATUSES.has(status) ? status : "",
    page: positivePage(params.get("page")),
  };
}

export function adminCollectionSearchParams(filters) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  return appendPage(params, filters.page || 1);
}

export function adminCollectionsApiPath(filters, pageSize = 20) {
  const params = adminCollectionSearchParams(filters);
  params.set("page", String(filters.page || 1));
  params.set("page_size", String(pageSize));
  return `/admin/collections?${params}`;
}

export function readAdminCommentFilters(params) {
  const status = params.get("status") || "";
  return {
    status: COMMENT_STATUSES.has(status) ? status : "",
    post_id: positiveId(params.get("post_id")),
    page: positivePage(params.get("page")),
  };
}

export function adminCommentSearchParams(filters) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.post_id) params.set("post_id", filters.post_id);
  return appendPage(params, filters.page || 1);
}

export function adminCommentsApiPath(filters, pageSize = 20) {
  const params = adminCommentSearchParams(filters);
  params.set("page", String(filters.page || 1));
  params.set("page_size", String(pageSize));
  return `/admin/comments?${params}`;
}

export function readAdminMediaFilters(params) {
  const kind = params.get("kind") || "";
  const status = params.get("status") || "";
  const boundType = params.get("bound_type") || "";
  return {
    kind: MEDIA_KINDS.has(kind) ? kind : "",
    status: MEDIA_STATUSES.has(status) ? status : "",
    owner_id: positiveId(params.get("owner_id")),
    bound_type: MEDIA_BOUND_TYPES.has(boundType) ? boundType : "",
    page: positivePage(params.get("page")),
  };
}

export function adminMediaSearchParams(filters) {
  const params = new URLSearchParams();
  ["kind", "status", "owner_id", "bound_type"]
    .forEach((key) => { if (filters[key]) params.set(key, filters[key]); });
  return appendPage(params, filters.page || 1);
}

export function adminMediaApiPath(filters, pageSize = 20) {
  const params = adminMediaSearchParams(filters);
  params.set("page", String(filters.page || 1));
  params.set("page_size", String(pageSize));
  return `/admin/media?${params}`;
}

export function readAdminLogFilters(params) {
  return {
    q: (params.get("q") || "").trim().slice(0, 100),
    action: (params.get("action") || "").trim().slice(0, 80),
    target_type: (params.get("target_type") || "").trim().slice(0, 40),
    target_id: (params.get("target_id") || "").trim().slice(0, 100),
    request_id: (params.get("request_id") || "").trim().slice(0, 64),
    operator_id: positiveId(params.get("operator_id")),
    page: positivePage(params.get("page")),
  };
}

export function adminLogSearchParams(filters) {
  const params = new URLSearchParams();
  ["q", "action", "target_type", "target_id", "request_id", "operator_id"]
    .forEach((key) => { if (filters[key]) params.set(key, filters[key]); });
  return appendPage(params, filters.page || 1);
}

export function adminLogsApiPath(filters, pageSize = 20) {
  const params = adminLogSearchParams(filters);
  params.set("page", String(filters.page || 1));
  params.set("page_size", String(pageSize));
  return `/admin/logs?${params}`;
}

export function siteSettingsForm(payload = {}) {
  const settings = payload.settings || {};
  return (payload.schema || []).reduce((result, item) => {
    result[item.key] = typeof settings[item.key] === "string" ? settings[item.key] : item.default || "";
    return result;
  }, {});
}

export function adminNotificationPayload({ message, scope, selectedIds = [], reason }) {
  const payload = { message: message.trim(), reason: reason.trim() };
  if (scope === "selected") {
    payload.user_ids = [...new Set(selectedIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))].sort((a, b) => a - b);
  }
  return payload;
}

export function readAdminTaxonomyFilters(params) {
  const status = params.get("status") || "";
  return {
    q: (params.get("q") || "").trim().slice(0, 100),
    status: TAXONOMY_STATUSES.has(status) ? status : "",
  };
}

export function adminTaxonomySearchParams({ q = "", status = "" }) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  return params;
}

export function filterAdminTaxonomy(items, { q = "", status = "" }) {
  const needle = q.trim().toLocaleLowerCase();
  return (items || []).filter((item) => {
    if (status === "active" && !item.is_active) return false;
    if (status === "inactive" && item.is_active) return false;
    if (!needle) return true;
    return [item.name, item.slug, item.description]
      .filter(Boolean)
      .some((value) => value.toLocaleLowerCase().includes(needle));
  });
}

const METRICS = [
  ["users", "用户"],
  ["posts", "Post"],
  ["articles", "Article"],
  ["notes", "Note"],
  ["drafts", "草稿"],
  ["collections", "Collection"],
  ["comments", "评论"],
  ["media", "媒体"],
];

export function dashboardMetrics(data = {}) {
  return METRICS.map(([key, label]) => ({ key, label, value: Number(data[key]) || 0 }));
}

export const adminLabels = {
  ok: "运行正常",
  unknown: "状态未知",
  active: "正常",
  banned: "已封禁",
  deactivated: "已停用",
  user: "普通成员",
  system_admin: "系统管理员",
  draft: "草稿",
  published: "已发布",
  archived: "已归档",
  hidden: "已隐藏",
  deleted: "已删除",
  login_only: "成员可见",
  private: "仅作者",
  article: "Article",
  note: "Note",
  inactive: "已停用",
  live_photo: "Live Photo",
  image: "图片",
};
