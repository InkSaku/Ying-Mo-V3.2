import assert from "node:assert/strict";
import test from "node:test";

import { renderMathExpression } from "../src/lib/mathRender.js";

test("renders inline and display expressions with MathML accessibility output", () => {
  const inline = renderMathExpression("E = mc^2");
  const display = renderMathExpression("\\int_0^1 x^2 \\, dx", true);
  assert.equal(inline.error, false);
  assert.match(inline.html, /class="katex"/);
  assert.match(inline.html, /<math/);
  assert.equal(display.error, false);
  assert.match(display.html, /class="katex-display"/);
});

test("rejects invalid or trusted HTML commands without returning injectable markup", () => {
  const invalid = renderMathExpression("\\frac{");
  const untrusted = renderMathExpression("\\href{javascript:alert(1)}{x}");
  const oversized = renderMathExpression("x".repeat(5001));
  assert.equal(invalid.error, true);
  assert.equal(oversized.error, true);
  assert.equal(untrusted.error, false);
  assert.doesNotMatch(untrusted.html, /href="javascript:/i);
});
