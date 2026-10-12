import assert from "node:assert/strict";
import test from "node:test";
import { selectedTagNames, tagKey } from "../src/lib/tagSelection.js";
import { draftPayloadFromForm } from "../src/lib/draftAutosave.js";
test("tags reuse case and whitespace variants without duplicate selection", () => {
  assert.deepEqual(selectedTagNames(" Python, python ，  阅读  ,阅读,  学习   笔记 "), ["Python", "阅读", "学习 笔记"]);
  assert.equal(tagKey("Straße"), tagKey("STRASSE"));
  assert.deepEqual(selectedTagNames(["日常", " 日常 ", ""]), ["日常"]);
  assert.deepEqual(draftPayloadFromForm({ post_type: "note", tag_names: "日常，日常,阅读", visibility: "private" }).tag_names, ["日常", "阅读"]);
});

test("tag selection preserves punctuation inside a single tag name", () => {
  assert.deepEqual(selectedTagNames(["New York, USA", "城市，路线", " new york, usa "]), ["New York, USA", "城市，路线"]);
  assert.deepEqual(draftPayloadFromForm({ post_type: "article", tag_names: ["New York, USA", "城市，路线"], visibility: "private" }).tag_names, ["New York, USA", "城市，路线"]);
});
