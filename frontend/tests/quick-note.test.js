import assert from "node:assert/strict";
import test from "node:test";

import {
  formWithQuickNoteAudience,
  initialQuickNoteForm,
  quickNoteAudienceValue,
  quickNoteBrowseItem,
  quickNoteDraftKey,
  quickNoteHasLocalContent,
  quickNotePayload,
  readQuickNoteDraft,
  removeQuickNoteDraft,
  writeQuickNoteDraft,
} from "../src/lib/quickNote.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("quick note payload keeps collection ACL authoritative", () => {
  const form = {
    ...initialQuickNoteForm(),
    body: "  今天下雨。  ",
    visibility: "login_only",
    collection_id: "12",
    occurred_at: "2026-08-25T09:30",
    location: "  上海  ",
    mood: "  平静  ",
  };
  assert.deepEqual(quickNotePayload(form), {
    post_type: "note",
    body: "今天下雨。",
    visibility: "private",
    collection_id: 12,
    tag_names: [],
    title: null,
    summary: null,
    occurred_at: new Date("2026-08-25T09:30").toISOString(),
    location: "上海",
    mood: "平静",
    external_video_url: null,
  });
});

test("quick note audience switches between independent and collection scopes", () => {
  const initial = initialQuickNoteForm();
  const shared = formWithQuickNoteAudience(initial, "login_only");
  assert.equal(quickNoteAudienceValue(shared), "login_only");
  const collection = formWithQuickNoteAudience(shared, "collection:9");
  assert.equal(quickNoteAudienceValue(collection), "collection:9");
  assert.equal(collection.visibility, "private");
  assert.equal(formWithQuickNoteAudience(collection, "private").collection_id, "");
});

test("quick note local recovery keeps its optional server draft id", () => {
  const storage = memoryStorage();
  const key = quickNoteDraftKey(7);
  const form = { ...initialQuickNoteForm(), body: "尚未发布" };
  assert.equal(writeQuickNoteDraft(storage, key, form, 33, new Date("2026-08-25T01:02:03Z")), true);
  assert.deepEqual(readQuickNoteDraft(storage, key), {
    saved_at: "2026-08-25T01:02:03.000Z",
    post_id: 33,
    form,
  });
  assert.equal(removeQuickNoteDraft(storage, key), true);
  assert.equal(readQuickNoteDraft(storage, key), null);
});

test("quick note detects meaningful local state without treating defaults as a draft", () => {
  assert.equal(quickNoteHasLocalContent(initialQuickNoteForm()), false);
  assert.equal(quickNoteHasLocalContent({ ...initialQuickNoteForm(), body: "片段" }), true);
  assert.equal(quickNoteHasLocalContent(initialQuickNoteForm(), 5), true);
});

test("published management response gains the first visual feed media", () => {
  const image = { id: 8, kind: "image", status: "active", deleted_at: null };
  const item = quickNoteBrowseItem({ id: 2, cover_media: null, bound_media: [image] });
  assert.equal(item.display_media, image);
});
