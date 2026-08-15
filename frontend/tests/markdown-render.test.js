import assert from "node:assert/strict";
import test from "node:test";

import { isIgnorableMarkdownWhitespace } from "../src/lib/markdownRender.js";

test("drops only invalid whitespace inside Markdown table structures", () => {
  for (const tag of ["table", "thead", "tbody", "tr"]) {
    assert.equal(isIgnorableMarkdownWhitespace("\n  ", tag), true);
  }
  assert.equal(isIgnorableMarkdownWhitespace(" ", "p"), false);
  assert.equal(isIgnorableMarkdownWhitespace("cell content", "tr"), false);
});
