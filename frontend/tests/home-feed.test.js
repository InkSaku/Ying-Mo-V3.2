import assert from "node:assert/strict";
import test from "node:test";

import {
  captureHomeFeedAnchor,
  homeFeedAnchorScrollTarget,
  homeFeedCacheKey,
  homeFeedDayKey,
  homeFeedDayLabel,
  homeFeedExcerpt,
  homeFeedMemoryInterludeIndex,
  homeFeedPath,
  mergeHomeFeedItems,
  normalizeHomeFeedType,
  readHomeFeedCache,
  readHomeFeedAnchor,
  readHomeFeedScroll,
  removeHomeFeedScroll,
  writeHomeFeedCache,
  writeHomeFeedAnchor,
  writeHomeFeedScroll,
} from "../src/lib/homeFeed.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("home feed URL keeps type and opaque cursor explicit", () => {
  assert.equal(normalizeHomeFeedType("unknown"), "all");
  assert.equal(homeFeedPath("note", "signed cursor", 18), "/home/feed?type=note&page_size=18&cursor=signed+cursor");
});

test("home feed pages merge stably without duplicate posts", () => {
  const first = [{ id: 3, body: "three" }, { id: 2, body: "two" }];
  const second = [{ id: 2, body: "duplicate" }, { id: 1, body: "one" }];
  assert.deepEqual(mergeHomeFeedItems(first, second).map((item) => item.body), ["three", "two", "one"]);
  assert.deepEqual(mergeHomeFeedItems(first, [{ id: 2, body: "fresh" }], { prepend: true }).map((item) => item.body), ["fresh", "three"]);
});

test("home feed memory interlude follows a stable low-frequency position", () => {
  const memory = { items: [{ id: 21 }] };
  assert.equal(homeFeedMemoryInterludeIndex(12, memory), 3);
  assert.equal(homeFeedMemoryInterludeIndex(2, memory), 2);
  assert.equal(homeFeedMemoryInterludeIndex(0, memory), 0);
  assert.equal(homeFeedMemoryInterludeIndex(12, null), -1);
  assert.equal(homeFeedMemoryInterludeIndex(12, { items: [] }), -1);
});

test("home feed memory cache is member scoped and expires", () => {
  const value = { items: [{ id: 8 }], nextCursor: "next", hasMore: true };
  writeHomeFeedCache(801, "all", value, 1_000);
  assert.equal(homeFeedCacheKey(801, "all"), "801:all");
  assert.deepEqual(readHomeFeedCache(801, "all", 2_000), value);
  assert.equal(readHomeFeedCache(801, "all", 30 * 60 * 1000 + 1_001), null);

  writeHomeFeedCache(801, "note", value, 5_000);
  assert.equal(readHomeFeedCache(802, "note", 5_001), null);
  assert.equal(readHomeFeedCache(801, "note", 5_002), null);
});

test("home feed anchor follows content instead of fragile absolute pixels", () => {
  const anchor = captureHomeFeedAnchor([
    { id: 9, top: 80, bottom: 130 },
    { id: 8, top: 130, bottom: 420 },
  ], 100);
  assert.deepEqual(anchor, { postId: 9, offset: -20 });
  assert.equal(homeFeedAnchorScrollTarget(anchor, {
    entryTop: 160,
    viewportTop: 120,
    scrollY: 900,
  }), 960);
  assert.equal(captureHomeFeedAnchor([{ id: 1, top: -90, bottom: -10 }], 0), null);
});

test("home feed anchors are memory-only, member scoped and filter isolated", () => {
  assert.equal(writeHomeFeedAnchor(701, "all", { postId: 12, offset: -18 }, 1_000), true);
  assert.deepEqual(readHomeFeedAnchor(701, "all", 2_000), { postId: 12, offset: -18 });
  assert.equal(readHomeFeedAnchor(701, "note", 2_000), null);
  assert.equal(readHomeFeedAnchor(702, "all", 2_000), null);
  assert.equal(readHomeFeedAnchor(701, "all", 2_001), null);
  assert.equal(writeHomeFeedAnchor(701, "all", { postId: 0, offset: 1 }), false);
});

test("home feed scroll position stores only a rounded number", () => {
  const storage = memoryStorage();
  assert.equal(readHomeFeedScroll(storage, 9, "all"), null);
  assert.equal(writeHomeFeedScroll(storage, 9, "all", 421.7), true);
  assert.equal(readHomeFeedScroll(storage, 9, "all"), 422);
  assert.equal(removeHomeFeedScroll(storage, 9, "all"), true);
  assert.equal(readHomeFeedScroll(storage, 9, "all"), null);
});

test("home feed groups calendar days with readable labels", () => {
  const now = new Date(2026, 7, 25, 12, 0, 0);
  const today = new Date(2026, 7, 25, 9, 0, 0);
  const yesterday = new Date(2026, 7, 24, 18, 0, 0);
  assert.equal(homeFeedDayLabel(today, now), "今天");
  assert.equal(homeFeedDayLabel(yesterday, now), "昨天");
  assert.equal(homeFeedDayKey(today), "2026-8-25");
});

test("home feed excerpt removes media placeholders and markdown noise", () => {
  assert.equal(homeFeedExcerpt({ body: "## 今天\n\n[[ym-media:7]]\n\n**下雨了**" }), "今天 下雨了");
  assert.equal(homeFeedExcerpt({ feed_excerpt: "接口预览", body: "完整正文" }), "接口预览");
  assert.equal(homeFeedExcerpt({ content_excerpt: "通用浏览预览", body: "完整正文" }), "通用浏览预览");
  assert.equal(homeFeedExcerpt({ summary: "123456" }, 4), "1234...");
});
