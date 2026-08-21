import test from "node:test";
import assert from "node:assert/strict";

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
