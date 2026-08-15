import assert from "node:assert/strict";
import test from "node:test";

import { highlightCode, languageFromClass } from "../src/lib/codeHighlight.js";

test("normalizes fenced-code aliases and highlights registered languages", () => {
  assert.equal(languageFromClass("language-py"), "python");
  assert.equal(languageFromClass("language-tsx"), "typescript");
  const result = highlightCode("import torch\nprint(torch.__version__)", "language-python");
  assert.equal(result.highlighted, true);
  assert.equal(result.language, "python");
  assert.match(result.html, /hljs-keyword/);
});

test("highlighted source remains escaped and unknown languages fall back to text", () => {
  const malicious = highlightCode('const value = "<img src=x onerror=alert(1)>";', "language-js");
  assert.equal(malicious.highlighted, true);
  assert.doesNotMatch(malicious.html, /<img/i);
  assert.match(malicious.html, /&lt;img/);
  assert.equal(highlightCode("content", "language-unknown").highlighted, false);
  assert.equal(highlightCode("content", "").highlighted, false);
});

test("oversized code skips highlighting without losing the source fallback", () => {
  assert.equal(highlightCode("x".repeat(50_001), "language-python").highlighted, false);
});
