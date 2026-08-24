import assert from "node:assert/strict";
import test from "node:test";

import {
  offlineDraftKey, readOfflineDraft, removeOfflineDraft, writeOfflineDraft,
} from "../src/lib/offlineDraft.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("offline drafts are scoped to member and route target", () => {
  assert.equal(offlineDraftKey(7, 42), "yingmo:offline-draft:v1:7:post:42");
  assert.equal(offlineDraftKey(7, null, "note", "9"), "yingmo:offline-draft:v1:7:new:note:9");
});

test("offline draft snapshots round-trip and can be discarded", () => {
  const storage = memoryStorage();
  const key = offlineDraftKey(3, 8);
  const savedAt = new Date("2026-08-24T01:02:03Z");
  assert.equal(writeOfflineDraft(storage, key, { body: "local recovery" }, savedAt), true);
  assert.deepEqual(readOfflineDraft(storage, key), {
    version: 1,
    saved_at: "2026-08-24T01:02:03.000Z",
    form: { body: "local recovery" },
  });
  assert.equal(removeOfflineDraft(storage, key), true);
  assert.equal(readOfflineDraft(storage, key), null);
});
