import assert from "node:assert/strict";
import test from "node:test";
import {
  summarizeTaxonomyItems,
  summarizeTaxonomyPosts,
  taxonomyTagProminence,
} from "../src/lib/taxonomy.js";

test("summarizes ACL-derived taxonomy counts without trusting invalid values", () => {
  assert.deepEqual(
    summarizeTaxonomyItems([
      { visible_post_count: 9 },
      { visible_post_count: 4 },
      { visible_post_count: -2 },
      {},
    ]),
    { itemCount: 4, postCount: 13, maxCount: 9 }
  );
});

test("assigns restrained tag prominence from the visible count range", () => {
  assert.equal(taxonomyTagProminence({ visible_post_count: 9 }, 9), "prominent");
  assert.equal(taxonomyTagProminence({ visible_post_count: 4 }, 9), "regular");
  assert.equal(taxonomyTagProminence({ visible_post_count: 2 }, 9), "quiet");
});

test("summarizes mixed article and note reading paths", () => {
  assert.deepEqual(
    summarizeTaxonomyPosts([
      { post_type: "article" },
      { post_type: "note" },
      { post_type: "note" },
      { post_type: "unknown" },
    ]),
    { articles: 1, notes: 2 }
  );
});
