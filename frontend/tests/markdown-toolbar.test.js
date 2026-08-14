import assert from "node:assert/strict";
import test from "node:test";

import { applyMarkdownShortcut } from "../src/lib/markdownToolbar.js";

test("bold wraps the current selection and keeps the inner text selected", () => {
  const result = applyMarkdownShortcut("hello", 0, 5, "bold");
  assert.equal(result.value, "**hello**");
  assert.equal(result.value.slice(result.selectionStart, result.selectionEnd), "hello");
});

test("heading inserts a readable placeholder at an empty cursor", () => {
  const result = applyMarkdownShortcut("前文", 2, 2, "heading");
  assert.equal(result.value, "前文\n\n## 标题");
  assert.equal(result.value.slice(result.selectionStart, result.selectionEnd), "标题");
});

test("quote and list prefix every selected line", () => {
  const quote = applyMarkdownShortcut("一\n二", 0, 3, "quote");
  const list = applyMarkdownShortcut("一\n二", 0, 3, "list");
  assert.equal(quote.value, "> 一\n> 二");
  assert.equal(list.value, "- 一\n- 二");
});

test("link keeps selected text as label and selects the URL placeholder", () => {
  const result = applyMarkdownShortcut("OpenAI", 0, 6, "link");
  assert.equal(result.value, "[OpenAI](https://)");
  assert.equal(result.value.slice(result.selectionStart, result.selectionEnd), "https://");
});

test("code inserts a fenced block and selects its content", () => {
  const result = applyMarkdownShortcut("", 0, 0, "code");
  assert.equal(result.value, "```\n代码\n```");
  assert.equal(result.value.slice(result.selectionStart, result.selectionEnd), "代码");
});

test("table inserts a starter template without losing selected text", () => {
  const result = applyMarkdownShortcut("姓名", 0, 2, "table");
  assert.equal(result.value, "| 姓名 | 列 2 |\n| --- | --- |\n| 内容 1 | 内容 2 |");
  assert.equal(result.value.slice(result.selectionStart, result.selectionEnd), "姓名");
});
