import assert from "node:assert/strict";
import test from "node:test";

import { isIgnorableMarkdownWhitespace, sameHeadingText } from "../src/lib/markdownRender.js";

test("recognizes duplicate headings without hiding different article sections", () => {
  assert.equal(sameHeadingText("  训练集\n 与验证集  ", "训练集 与验证集"), true);
  assert.equal(sameHeadingText("Cafe\u0301", "Café"), true);
  assert.equal(sameHeadingText("训练集的划分", "训练集与测试集"), false);
  assert.equal(sameHeadingText("Test", "test"), false);
  assert.equal(sameHeadingText("", ""), false);
});

test("drops only invalid whitespace inside Markdown table structures", () => {
  for (const tag of ["table", "thead", "tbody", "tr"]) {
    assert.equal(isIgnorableMarkdownWhitespace("\n  ", tag), true);
  }
  assert.equal(isIgnorableMarkdownWhitespace(" ", "p"), false);
  assert.equal(isIgnorableMarkdownWhitespace("cell content", "tr"), false);
});
