import assert from "node:assert/strict";
import test from "node:test";

import {
  applyMarkdownShortcut,
  markdownActionForKeyEvent,
} from "../src/lib/markdownToolbar.js";

test("bold wraps the current selection and keeps the inner text selected", () => {
  const result = applyMarkdownShortcut("hello", 0, 5, "bold");
  assert.equal(result.value, "**hello**");
  assert.equal(result.value.slice(result.selectionStart, result.selectionEnd), "hello");
});

test("bold toggles off without nesting markers", () => {
  const result = applyMarkdownShortcut("**hello**", 2, 7, "bold");
  assert.equal(result.value, "hello");
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

test("block shortcuts toggle existing prefixes and ignore a trailing blank line", () => {
  const quote = applyMarkdownShortcut("> 一\n> 二", 0, 7, "quote");
  const list = applyMarkdownShortcut("一\n二\n", 0, 4, "list");
  assert.equal(quote.value, "一\n二");
  assert.equal(list.value, "- 一\n- 二\n");
});

test("ordered list numbers selected lines and toggles existing markers", () => {
  const inserted = applyMarkdownShortcut("甲\n乙\n\n丙", 0, 6, "orderedList");
  const removed = applyMarkdownShortcut("1. 甲\n2. 乙", 0, 9, "orderedList");
  const normalized = applyMarkdownShortcut("8. 甲\n乙", 0, 6, "orderedList");
  assert.equal(inserted.value, "1. 甲\n2. 乙\n\n3. 丙");
  assert.equal(removed.value, "甲\n乙");
  assert.equal(normalized.value, "1. 甲\n2. 乙");
});

test("ordered list inserts a selected placeholder at an empty cursor", () => {
  const result = applyMarkdownShortcut("", 0, 0, "orderedList");
  assert.equal(result.value, "1. 列表项");
  assert.equal(result.value.slice(result.selectionStart, result.selectionEnd), "列表项");
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

test("code toggles off and chooses a safe fence for selected backticks", () => {
  const toggled = applyMarkdownShortcut("```\ncode\n```", 4, 8, "code");
  const safeFence = applyMarkdownShortcut("const value = ```;", 0, 18, "code");
  assert.equal(toggled.value, "code");
  assert.equal(safeFence.value, "````\nconst value = ```;\n````");
});

test("table inserts a starter template without losing selected text", () => {
  const result = applyMarkdownShortcut("姓名", 0, 2, "table");
  assert.equal(result.value, "| 姓名 | 列 2 |\n| --- | --- |\n| 内容 1 | 内容 2 |");
  assert.equal(result.value.slice(result.selectionStart, result.selectionEnd), "姓名");
});

test("footnote keeps selected reference text and selects its definition", () => {
  const result = applyMarkdownShortcut("需要说明", 0, 4, "footnote");
  assert.equal(result.value, "需要说明[^1]\n\n[^1]: 脚注内容");
  assert.equal(result.value.slice(result.selectionStart, result.selectionEnd), "脚注内容");
});

test("footnote chooses the next numeric id without overwriting existing definitions", () => {
  const source = "正文[^1]\n\n[^1]: 已有说明";
  const result = applyMarkdownShortcut(source, 2, 2, "footnote");
  assert.equal(result.value, "正文脚注引用[^2][^1]\n\n[^1]: 已有说明\n\n[^2]: 脚注内容");
  assert.equal(result.value.slice(result.selectionStart, result.selectionEnd), "脚注内容");
});

test("inline math wraps and toggles selected TeX", () => {
  const inserted = applyMarkdownShortcut("E = mc^2", 0, 8, "inlineMath");
  const removed = applyMarkdownShortcut("$E = mc^2$", 1, 9, "inlineMath");
  assert.equal(inserted.value, "$E = mc^2$");
  assert.equal(inserted.value.slice(inserted.selectionStart, inserted.selectionEnd), "E = mc^2");
  assert.equal(removed.value, "E = mc^2");
});

test("block math inserts a display formula and toggles its fences", () => {
  const inserted = applyMarkdownShortcut("", 0, 0, "mathBlock");
  const removed = applyMarkdownShortcut("$$\n\\sum_{i=1}^n i\n$$", 3, 17, "mathBlock");
  assert.equal(inserted.value, "$$\n\\frac{a}{b}\n$$");
  assert.equal(inserted.value.slice(inserted.selectionStart, inserted.selectionEnd), "\\frac{a}{b}");
  assert.equal(removed.value, "\\sum_{i=1}^n i");
});

test("keyboard shortcuts cover inline and ordered or unordered list actions", () => {
  assert.equal(markdownActionForKeyEvent({ key: "B", metaKey: true }), "bold");
  assert.equal(markdownActionForKeyEvent({ key: "k", ctrlKey: true }), "link");
  assert.equal(markdownActionForKeyEvent({ key: "&", code: "Digit7", metaKey: true, shiftKey: true }), "orderedList");
  assert.equal(markdownActionForKeyEvent({ key: "*", code: "Digit8", ctrlKey: true, shiftKey: true }), "list");
  assert.equal(markdownActionForKeyEvent({ key: "b", ctrlKey: true, repeat: true }), null);
  assert.equal(markdownActionForKeyEvent({ key: "b", ctrlKey: true, shiftKey: true }), null);
  assert.equal(markdownActionForKeyEvent({ key: "b" }), null);
});
