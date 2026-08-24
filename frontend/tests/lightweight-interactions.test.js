import test from "node:test";
import assert from "node:assert/strict";

import {
  insertOptimisticComment,
  removeOptimisticComment,
  replaceOptimisticComment,
} from "../src/lib/commentOptimistic.js";
import { normalizeReactions, optimisticReaction } from "../src/lib/reactions.js";

test("normalizes six fixed reactions and applies an optimistic one-choice switch", () => {
  const initial = normalizeReactions({
    selected: "heart",
    items: [{ kind: "heart", count: 2 }, { kind: "wow", count: 1 }],
  });
  assert.equal(initial.items.length, 6);
  const switched = optimisticReaction(initial, "wow");
  assert.equal(switched.selected, "wow");
  assert.equal(switched.items.find((item) => item.kind === "heart").count, 1);
  assert.equal(switched.items.find((item) => item.kind === "wow").count, 2);
  const cleared = optimisticReaction(switched, "wow");
  assert.equal(cleared.selected, null);
  assert.equal(cleared.items.find((item) => item.kind === "wow").count, 1);
});

test("inserts, replaces and rolls back optimistic root comments and flat replies", () => {
  const roots = [{ id: 1, body: "root", replies: [] }];
  const temporaryReply = { id: "temp-one", parent_id: 1, body: "reply" };
  const inserted = insertOptimisticComment(roots, temporaryReply);
  assert.equal(inserted[0].replies[0].id, "temp-one");
  const replaced = replaceOptimisticComment(inserted, "temp-one", { id: 2, parent_id: 1, body: "saved" });
  assert.equal(replaced[0].replies[0].id, 2);
  const rolledBack = removeOptimisticComment(inserted, "temp-one");
  assert.deepEqual(rolledBack, roots);

  const rootInserted = insertOptimisticComment(roots, { id: "temp-root", parent_id: null, body: "new" });
  assert.equal(rootInserted.length, 2);
  assert.deepEqual(removeOptimisticComment(rootInserted, "temp-root"), roots);
});
