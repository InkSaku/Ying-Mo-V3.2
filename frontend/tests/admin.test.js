import test from "node:test";
import assert from "node:assert/strict";

import {
  adminCollectionSearchParams,
  adminCollectionsApiPath,
  adminCommentSearchParams,
  adminCommentsApiPath,
  adminPostSearchParams,
  adminPostsApiPath,
  adminMediaApiPath,
  adminMediaSearchParams,
  adminLogSearchParams,
  adminLogsApiPath,
  adminNotificationPayload,
  adminTaxonomySearchParams,
  adminUserSearchParams,
  adminUsersApiPath,
  dashboardMetrics,
  filterAdminTaxonomy,
  readAdminCollectionFilters,
  readAdminCommentFilters,
  readAdminPostFilters,
  readAdminMediaFilters,
  readAdminLogFilters,
  readAdminTaxonomyFilters,
  readAdminUserFilters,
  siteSettingsForm,
} from "../src/lib/admin.js";

test("normalizes Admin user filters and builds a paginated API path", () => {
  const filters = readAdminUserFilters(new URLSearchParams("q=%20alice%20&status=active&role=user&page=2"));
  assert.deepEqual(filters, { q: "alice", status: "active", role: "user", page: 2 });
  assert.equal(adminUserSearchParams(filters).toString(), "q=alice&status=active&role=user&page=2");
  assert.equal(adminUsersApiPath(filters), "/admin/users?q=alice&status=active&role=user&page=2&page_size=20");

  const invalid = readAdminUserFilters(new URLSearchParams("status=reviewing&role=editor&page=0"));
  assert.deepEqual(invalid, { q: "", status: "", role: "", page: 1 });
});

test("normalizes Admin Media filters and builds logical-media pagination", () => {
  const filters = readAdminMediaFilters(new URLSearchParams("kind=live_photo&status=hidden&owner_id=7&bound_type=unbound&page=3"));
  assert.deepEqual(filters, {
    kind: "live_photo", status: "hidden", owner_id: "7", bound_type: "unbound", page: 3,
  });
  assert.equal(adminMediaSearchParams(filters).toString(), "kind=live_photo&status=hidden&owner_id=7&bound_type=unbound&page=3");
  assert.equal(adminMediaApiPath(filters, 10), "/admin/media?kind=live_photo&status=hidden&owner_id=7&bound_type=unbound&page=3&page_size=10");

  assert.deepEqual(readAdminMediaFilters(new URLSearchParams("kind=video&status=deleted&owner_id=0&bound_type=unknown&page=no")), {
    kind: "", status: "", owner_id: "", bound_type: "", page: 1,
  });
});

test("normalizes Admin Log filters and preserves exact audit targets", () => {
  const filters = readAdminLogFilters(new URLSearchParams("q=%20review%20&action=featured.update&target_type=featured&target_id=12&request_id=req-42&operator_id=7&page=4"));
  assert.deepEqual(filters, {
    q: "review", action: "featured.update", target_type: "featured", target_id: "12",
    request_id: "req-42", operator_id: "7", page: 4,
  });
  assert.equal(adminLogSearchParams(filters).toString(), "q=review&action=featured.update&target_type=featured&target_id=12&request_id=req-42&operator_id=7&page=4");
  assert.equal(adminLogsApiPath(filters, 10), "/admin/logs?q=review&action=featured.update&target_type=featured&target_id=12&request_id=req-42&operator_id=7&page=4&page_size=10");
  assert.equal(readAdminLogFilters(new URLSearchParams("operator_id=0&page=no")).operator_id, "");
});

test("builds schema-backed settings forms and explicit notification scopes", () => {
  const settings = siteSettingsForm({
    settings: { site_name: "Paper Garden" },
    schema: [
      { key: "site_name", default: "映墨" },
      { key: "footer", default: "Default footer" },
    ],
  });
  assert.deepEqual(settings, { site_name: "Paper Garden", footer: "Default footer" });

  assert.deepEqual(adminNotificationPayload({
    message: "  Selected note  ", scope: "selected", selectedIds: [3, 2, 3, 0, "bad"], reason: "  audit  ",
  }), { message: "Selected note", reason: "audit", user_ids: [2, 3] });
  assert.deepEqual(adminNotificationPayload({
    message: "All", scope: "all", selectedIds: [2], reason: "site-wide",
  }), { message: "All", reason: "site-wide" });
});

test("Dashboard metrics include only the V3.2 counters", () => {
  const metrics = dashboardMetrics({ users: 3, posts: 7, approved_writers: 99, pending_reports: 10 });
  assert.deepEqual(metrics.map((item) => item.key), [
    "users", "posts", "articles", "notes", "drafts", "collections", "comments", "media",
  ]);
  assert.equal(metrics[0].value, 3);
  assert.equal(metrics[1].value, 7);
  assert.ok(metrics.slice(2).every((item) => item.value === 0));
});

test("normalizes all Admin Post filters and preserves them in API requests", () => {
  const filters = readAdminPostFilters(new URLSearchParams("q=%20paper%20&post_type=article&status=draft&visibility=private&moderation_status=hidden&author_id=2&category_id=3&tag_id=4&collection_id=5&page=3"));
  assert.deepEqual(filters, {
    q: "paper", post_type: "article", status: "draft", visibility: "private",
    moderation_status: "hidden", author_id: "2", category_id: "3", tag_id: "4",
    collection_id: "5", page: 3,
  });
  assert.equal(adminPostSearchParams(filters).toString(), "q=paper&post_type=article&status=draft&visibility=private&moderation_status=hidden&author_id=2&category_id=3&tag_id=4&collection_id=5&page=3");
  assert.equal(adminPostsApiPath(filters, 10), "/admin/posts?q=paper&post_type=article&status=draft&visibility=private&moderation_status=hidden&author_id=2&category_id=3&tag_id=4&collection_id=5&page=3&page_size=10");

  const invalid = readAdminPostFilters(new URLSearchParams("post_type=video&status=review&visibility=public&moderation_status=deleted&author_id=-2&category_id=abc&tag_id=0&collection_id=2.5&page=0"));
  assert.deepEqual(invalid, {
    q: "", post_type: "", status: "", visibility: "", moderation_status: "",
    author_id: "", category_id: "", tag_id: "", collection_id: "", page: 1,
  });
});

test("normalizes Collection and comment governance filters", () => {
  const collections = readAdminCollectionFilters(new URLSearchParams("q=%20field%20&status=hidden&page=2"));
  assert.deepEqual(collections, { q: "field", status: "hidden", page: 2 });
  assert.equal(adminCollectionSearchParams(collections).toString(), "q=field&status=hidden&page=2");
  assert.equal(adminCollectionsApiPath(collections), "/admin/collections?q=field&status=hidden&page=2&page_size=20");

  const comments = readAdminCommentFilters(new URLSearchParams("status=deleted&post_id=42&page=4"));
  assert.deepEqual(comments, { status: "deleted", post_id: "42", page: 4 });
  assert.equal(adminCommentSearchParams(comments).toString(), "status=deleted&post_id=42&page=4");
  assert.equal(adminCommentsApiPath(comments), "/admin/comments?status=deleted&post_id=42&page=4&page_size=20");

  assert.deepEqual(readAdminCollectionFilters(new URLSearchParams("status=deleted&page=-1")), { q: "", status: "", page: 1 });
  assert.deepEqual(readAdminCommentFilters(new URLSearchParams("status=review&post_id=0&page=no")), { status: "", post_id: "", page: 1 });
});

test("normalizes and applies Admin taxonomy URL filters", () => {
  const filters = readAdminTaxonomyFilters(new URLSearchParams("q=%20Paper%20&status=inactive"));
  assert.deepEqual(filters, { q: "Paper", status: "inactive" });
  assert.equal(adminTaxonomySearchParams(filters).toString(), "q=Paper&status=inactive");
  assert.deepEqual(readAdminTaxonomyFilters(new URLSearchParams("status=deleted")), { q: "", status: "" });

  const items = [
    { id: 1, name: "Paper Notes", slug: "paper-notes", description: "Editorial", is_active: true },
    { id: 2, name: "Field", slug: "field-paper", description: null, is_active: false },
    { id: 3, name: "Archive", slug: "archive", description: "Paper trail", is_active: false },
  ];
  assert.deepEqual(filterAdminTaxonomy(items, filters).map((item) => item.id), [2, 3]);
  assert.deepEqual(filterAdminTaxonomy(items, { q: "editorial", status: "active" }).map((item) => item.id), [1]);
  assert.deepEqual(filterAdminTaxonomy(items, { q: "", status: "active" }).map((item) => item.id), [1]);
});
