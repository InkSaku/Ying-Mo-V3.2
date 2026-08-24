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
  const styles = readFileSync(new URL("../src/styles/index.css", import.meta.url), "utf8");
  const exploreStyles = styles.slice(styles.indexOf(".explore-hero {"), styles.indexOf("@media (max-width: 1100px)", styles.indexOf(".explore-hero {")));

  assert.match(page, /explore-article-layout/);
  assert.match(page, /explore-note-rail/);
  assert.match(page, /explore-index-layout/);
  assert.match(page, /explore-memory-section/);
  assert.doesNotMatch(page, /explore-tag-cloud|two-column-grid|note-stream/);
  assert.doesNotMatch(exploreStyles, /linear-gradient|backdrop-filter/);
});
