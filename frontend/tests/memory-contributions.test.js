import assert from "node:assert/strict";
import test from "node:test";

import {
  localDateTimeValue,
  memoryContributionPayload,
  memoryDraftKey,
  readMemoryDraft,
  removeMemoryDraft,
  writeMemoryDraft,
} from "../src/lib/memoryContributions.js";

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("memory contribution drafts are isolated by member and root", () => {
  assert.equal(memoryDraftKey(3, 18), "yingmo:memory-contribution:v1:3:18");
  assert.notEqual(memoryDraftKey(3, 18), memoryDraftKey(4, 18));
  assert.notEqual(memoryDraftKey(3, 18), memoryDraftKey(3, 19));
});

test("memory contribution local recovery round trips and removes safely", () => {
  const target = storage();
  const key = memoryDraftKey(3, 18);
  const draft = {
    requestId: "4dc47b38-c09f-45d1-b8ac-831222b8c07d",
    postId: 27,
    body: "另一边的日出",
    occurredAt: "2026-07-03T05:30",
    location: "海边",
  };
  assert.equal(writeMemoryDraft(target, key, draft), true);
  assert.deepEqual(readMemoryDraft(target, key), draft);
  removeMemoryDraft(target, key);
  assert.equal(readMemoryDraft(target, key), null);
});

test("publish payload normalizes optional fields and keeps edit version", () => {
  const value = memoryContributionPayload({
    body: "  另一边的日出  ",
    occurredAt: "",
    location: "   ",
  }, 7);
  assert.deepEqual(value, {
    body: "另一边的日出",
    occurred_at: null,
    location: null,
    expected_version: 7,
  });
  assert.equal(localDateTimeValue("not-a-date"), "");
});
