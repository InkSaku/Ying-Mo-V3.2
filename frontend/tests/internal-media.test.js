import assert from "node:assert/strict";
import test from "node:test";

import {
  insertMediaPlaceholder,
  mediaIdsInMarkdown,
  mediaPlaceholder,
  removeMediaPlaceholders,
} from "../src/lib/internalMedia.js";

test("media placeholder helpers keep ids stable", () => {
  assert.equal(mediaPlaceholder(12), "[[ym-media:12]]");
  assert.deepEqual([...mediaIdsInMarkdown("a [[ym-media:12]] b [[ym-media:12]] [[ym-media:8]]")], [12, 8]);
});

test("insertMediaPlaceholder inserts a block at the selection", () => {
  const result = insertMediaPlaceholder("beforeafter", 7, 6, 6);
  assert.equal(result.value, "before\n\n[[ym-media:7]]\n\nafter");
  assert.equal(result.cursor, "before\n\n[[ym-media:7]]\n\n".length);
});

test("removeMediaPlaceholders removes only requested media", () => {
  assert.equal(
    removeMediaPlaceholders("[[ym-media:1]] x [[ym-media:2]]", [1]),
    " x [[ym-media:2]]",
  );
});
