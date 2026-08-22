import test from "node:test";
import assert from "node:assert/strict";

import {
  collectionMemoryApiPath,
  collectionMemorySearchParams,
  groupTimelineItems,
  readCollectionMemoryState,
} from "../src/lib/collectionMemories.js";

test("Collection memory filters remain shareable and use the matching endpoint", () => {
  const state = readCollectionMemoryState(new URLSearchParams(
    "view=media&year=2024&author=Alice&type=note&page=3"
  ));
  assert.deepEqual(state, { view: "media", year: "2024", author: "alice", type: "note", page: 3 });
  assert.equal(
    collectionMemorySearchParams(state).toString(),
    "view=media&year=2024&author=alice&type=note&page=3"
  );
  assert.equal(
    collectionMemoryApiPath("shared-days", state, 24),
    "/collections/shared-days/media?year=2024&author=alice&post_type=note&page=3&page_size=24"
  );
});

test("Collection timeline groups stable semantic dates by year and month", () => {
  const groups = groupTimelineItems([
    { id: 1, semantic_time: "2024-08-02T00:00:00Z" },
    { id: 2, semantic_time: "2024-08-01T00:00:00Z" },
    { id: 3, semantic_time: "2023-12-10T00:00:00Z" },
    { id: 4, semantic_time: null },
  ]);
  assert.deepEqual(groups.map((group) => [group.year, group.month, group.items.map((item) => item.id)]), [
    [2024, 8, [1, 2]], [2023, 12, [3]],
  ]);
});
