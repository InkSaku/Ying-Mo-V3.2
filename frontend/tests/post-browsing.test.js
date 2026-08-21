import test from "node:test";
import assert from "node:assert/strict";

import {
  hasActivePostFilters,
  postFilterSearchParams,
  postsApiPath,
  readPostFilters,
} from "../src/lib/postBrowsing.js";

test("normalizes Article filters and preserves them in the API path", () => {
  const filters = readPostFilters(new URLSearchParams(
    "author=alice&category=travel&tag=japan&collection=tokyo&sort=updated&page=3"
  ), "article");
  assert.deepEqual(filters, {
    author: "alice", category: "travel", tag: "japan", collection: "tokyo", sort: "updated", page: 3,
  });
  assert.equal(
    postFilterSearchParams(filters).toString(),
    "author=alice&category=travel&tag=japan&collection=tokyo&sort=updated&page=3"
  );
  assert.equal(
    postsApiPath("article", filters),
    "/posts?author=alice&category=travel&tag=japan&collection=tokyo&sort=updated&page=3&post_type=article&page_size=12"
  );
  assert.equal(hasActivePostFilters(filters), true);
});

test("Note filters discard Category and invalid pagination or sort values", () => {
  const filters = readPostFilters(new URLSearchParams("category=secret&sort=popular&page=0"), "note");
  assert.deepEqual(filters, {
    author: "", category: "", tag: "", collection: "", sort: "newest", page: 1,
  });
  assert.equal(postFilterSearchParams(filters).toString(), "");
  assert.equal(hasActivePostFilters(filters), false);
});
