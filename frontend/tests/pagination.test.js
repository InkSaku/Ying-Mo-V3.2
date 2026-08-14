import test from "node:test";
import assert from "node:assert/strict";

import { clampPageToTotal, pageAfterRemovingItem } from "../src/lib/pagination.js";

test("clamps oversized favorite pages to the last available page", () => {
  assert.equal(clampPageToTotal(4, 21, 20), 2);
  assert.equal(clampPageToTotal(2, 0, 20), 1);
});

test("moves back after removing the only item on the last favorite page", () => {
  assert.equal(pageAfterRemovingItem({ page: 2, total: 21, pageSize: 20 }), 1);
  assert.equal(pageAfterRemovingItem({ page: 2, total: 22, pageSize: 20 }), 2);
  assert.equal(pageAfterRemovingItem({ page: 1, total: 1, pageSize: 20 }), 1);
});
