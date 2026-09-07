import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createExploreSeed, exploreApiPath, normalizeExploreSeed } from "../src/lib/explore.js";

test("keeps Explore seeds URL-safe and shareable", () => {
  assert.equal(normalizeExploreSeed("batch-abc_123"), "batch-abc_123");
  assert.equal(normalizeExploreSeed("bad seed"), "");
  assert.equal(normalizeExploreSeed("x".repeat(65)), "");
  assert.equal(exploreApiPath("batch-abc"), "/explore?seed=batch-abc");
  assert.equal(exploreApiPath("bad seed"), "/explore");
});

test("creates deterministic valid seeds from a supplied timestamp", () => {
  assert.equal(createExploreSeed(123456), "batch-2n9c");
  assert.match(createExploreSeed(0), /^batch-[a-z0-9]+$/);
});

test("Explore keeps its editorial hierarchy instead of equal card sections", () => {
  const page = readFileSync(new URL("../src/pages/ExplorePage.jsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/styles/explore.css", import.meta.url), "utf8");

  assert.match(page, /explore-frontispiece/);
  assert.match(page, /ExploreOpening/);
  assert.match(page, /explore-article-ledger/);
  assert.match(page, /explore-note-rail/);
  assert.match(page, /explore-index-layout/);
  assert.match(page, /explore-memory-section/);
  assert.match(page, /variant="featured"/);
  assert.match(page, /without-media/);
  assert.match(page, /explore-all-empty/);
  assert.doesNotMatch(page, /useOriginal|ARTICLE<br/);
  assert.doesNotMatch(page, /SectionHeader|explore-tag-cloud|two-column-grid|note-stream/);
  assert.doesNotMatch(styles, /linear-gradient|backdrop-filter|border-radius:\s*999px/);
});
