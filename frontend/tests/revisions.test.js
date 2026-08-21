import test from "node:test";
import assert from "node:assert/strict";

import {
  positiveRevisionParam,
  revisionChangedLabels,
  revisionReasonLabel,
} from "../src/lib/revisions.js";

test("labels revision reasons and changed snapshot fields", () => {
  assert.equal(revisionReasonLabel("manual_edit"), "内容修改前保存");
  assert.equal(revisionReasonLabel("restore"), "恢复历史版本前保存");
  assert.deepEqual(
    revisionChangedLabels(["title", "body", "collection_id", "unknown"]),
    ["标题", "正文", "Collection", "unknown"]
  );
});

test("normalizes positive revision URL parameters", () => {
  assert.equal(positiveRevisionParam("12"), 12);
  assert.equal(positiveRevisionParam("0"), 0);
  assert.equal(positiveRevisionParam("invalid", 1), 1);
});
