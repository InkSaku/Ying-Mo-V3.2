import assert from "node:assert/strict";
import test from "node:test";

import {
  activeHeadingAt,
  calculateReadingProgress,
  hasArticleToc,
  normalizeArticleOutline,
} from "../src/lib/articleReading.js";

test("normalizes article outline levels and rejects duplicate or malformed entries", () => {
  assert.deepEqual(normalizeArticleOutline([
    { id: "start", label: " 起点 ", level: 2 },
    { id: "child", label: "子节", level: 3 },
    { id: "deep", label: "深入", level: 4 },
    { id: "start", label: "重复", level: 2 },
    { id: "hidden", label: "五级", level: 5 },
    { id: "", label: "空 ID", level: 2 },
  ]), [
    { id: "start", label: "起点", level: 2 },
    { id: "child", label: "子节", level: 3 },
    { id: "deep", label: "深入", level: 4 },
  ]);
});

test("hides an empty or single-heading table of contents", () => {
  assert.equal(hasArticleToc([]), false);
  assert.equal(hasArticleToc([{ id: "only", label: "唯一标题", level: 2 }]), false);
  assert.equal(hasArticleToc([
    { id: "one", label: "第一节", level: 2 },
    { id: "two", label: "第二节", level: 2 },
  ]), true);
});

test("calculates bounded reading progress against the readable content range", () => {
  const base = { contentTop: 200, contentHeight: 1200, viewportHeight: 400 };
  assert.equal(calculateReadingProgress({ ...base, scrollTop: 0 }), 0);
  assert.equal(calculateReadingProgress({ ...base, scrollTop: 600 }), 50);
  assert.equal(calculateReadingProgress({ ...base, scrollTop: 2000 }), 100);
  assert.equal(calculateReadingProgress({ scrollTop: 100, contentTop: 100, contentHeight: 200, viewportHeight: 400 }), 100);
});

test("selects the last heading above the sticky-header threshold", () => {
  const positions = [
    { id: "one", top: 200 },
    { id: "two", top: 600 },
    { id: "three", top: 1000 },
  ];
  assert.equal(activeHeadingAt(positions, 100), "one");
  assert.equal(activeHeadingAt(positions, 600), "two");
  assert.equal(activeHeadingAt(positions, 1400), "three");
});
