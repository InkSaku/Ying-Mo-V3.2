import test from "node:test";
import assert from "node:assert/strict";

import { cleanMemoryPage, groupMemories, memoryDayLabel } from "../src/lib/onThisDay.js";

test("groups ordered memories without losing mixed Article and Note items", () => {
  const items = [
    { id: 1, memory_year: 2024, years_ago: 2, post_type: "article" },
    { id: 2, memory_year: 2024, years_ago: 2, post_type: "note" },
    { id: 3, memory_year: 2021, years_ago: 5, post_type: "note" },
  ];
  assert.deepEqual(groupMemories(items), [
    { year: 2024, yearsAgo: 2, items: items.slice(0, 2) },
    { year: 2021, yearsAgo: 5, items: items.slice(2) },
  ]);
});

test("normalizes page and calendar labels", () => {
  assert.equal(cleanMemoryPage("3"), 3);
  assert.equal(cleanMemoryPage("0"), 1);
  assert.equal(cleanMemoryPage("bad"), 1);
  assert.equal(memoryDayLabel({ month: 8, day: 21 }), "8 月 21 日");
  assert.equal(memoryDayLabel(null), "今天");
});
