import test from "node:test";
import assert from "node:assert/strict";

import {
  autosaveStatusLabel,
  draftFingerprint,
  draftPayloadFromForm,
} from "../src/lib/draftAutosave.js";

const baseForm = {
  post_type: "article",
  title: "",
  summary: "",
  body: "",
  visibility: "private",
  occurred_at: "",
  location: "",
  mood: "",
  external_video_url: "",
  slug: "",
  collection_id: "",
  category_id: "",
  tag_names: "",
};

test("builds the exact normalized payload used by draft saves", () => {
  assert.deepEqual(draftPayloadFromForm({
    ...baseForm,
    title: "Paper",
    body: "body",
    collection_id: "7",
    category_id: "3",
    tag_names: "Python,  Notes, Python",
  }), {
    post_type: "article",
    body: "body",
    visibility: "private",
    collection_id: 7,
    tag_names: ["Python", "Notes", "Python"],
    title: "Paper",
    summary: null,
    slug: null,
    category_id: 3,
  });
});

test("fingerprints distinguish unsaved editor changes", () => {
  const initial = draftPayloadFromForm(baseForm);
  const changed = draftPayloadFromForm({ ...baseForm, body: "local text" });
  assert.notEqual(draftFingerprint(initial), draftFingerprint(changed));
  assert.equal(draftFingerprint(initial), draftFingerprint({ ...initial }));
});

test("labels draft and published save states without hiding local failures", () => {
  assert.equal(autosaveStatusLabel({ status: "dirty" }), "有未保存修改");
  assert.equal(
    autosaveStatusLabel({ status: "error" }),
    "自动保存失败，本地内容仍保留",
  );
  assert.equal(
    autosaveStatusLabel({ status: "idle" }, false),
    "已发布内容仅手动保存",
  );
});
