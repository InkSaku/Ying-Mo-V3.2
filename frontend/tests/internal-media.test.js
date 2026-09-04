import assert from "node:assert/strict";
import test from "node:test";

import {
  insertMediaPlaceholder,
  mediaIdsInMarkdown,
  mediaPlaceholder,
  removeMediaPlaceholders,
} from "../src/lib/internalMedia.js";
import {
  mediaOrder,
  reorderMediaPlaceholders,
  replaceVisualTextBlock,
  visualMarkdownBlocks,
} from "../src/lib/visualMarkdown.js";
import {
  isAcceptedImageFile,
  isHeicImage,
  shouldOptimizeImage,
  uploadProgressLabel,
} from "../src/lib/imageUpload.js";

test("media placeholder helpers keep ids stable", () => {
  assert.equal(mediaPlaceholder(12), "[[ym-media:12]]");
  assert.deepEqual([...mediaIdsInMarkdown("a [[ym-media:12]] b [[ym-media:12]] [[ym-media:8]]")], [12, 8]);
});

test("insertMediaPlaceholder inserts a block at the selection", () => {
  const result = insertMediaPlaceholder("beforeafter", 7, 6, 6);
  assert.equal(result.value, "before\n\n[[ym-media:7]]\n\nafter");
  assert.equal(result.cursor, "before\n\n[[ym-media:7]]\n\n".length);
});

test("successive media insertions advance the cursor without reversing image order", () => {
  const first = insertMediaPlaceholder("beforeafter", 7, 6, 6);
  const second = insertMediaPlaceholder(first.value, 8, first.cursor, first.cursor);

  assert.equal(second.value, "before\n\n[[ym-media:7]]\n\n[[ym-media:8]]\n\nafter");
});

test("removeMediaPlaceholders removes only requested media", () => {
  assert.equal(
    removeMediaPlaceholders("[[ym-media:1]] x [[ym-media:2]]", [1]),
    " x [[ym-media:2]]",
  );
});

test("visual markdown splits editable text from hidden media tokens without data loss", () => {
  const source = "开头\n\n[[ym-media:7]]\n\n结尾";
  const blocks = visualMarkdownBlocks(source);

  assert.deepEqual(blocks.map((block) => block.type), ["text", "media", "text"]);
  assert.equal(blocks[1].mediaId, 7);
  assert.equal(replaceVisualTextBlock(source, blocks[2], "\n\n新的结尾"), "开头\n\n[[ym-media:7]]\n\n新的结尾");
});

test("visual markdown reorders image blocks while preserving surrounding prose", () => {
  const source = "甲[[ym-media:7]]乙[[ym-media:8]]丙";
  const reordered = reorderMediaPlaceholders(source, 8, 7);

  assert.equal(reordered, "甲[[ym-media:8]]乙[[ym-media:7]]丙");
  assert.deepEqual(mediaOrder(reordered), [8, 7]);
});

test("image upload helpers accept phone formats and optimize only oversized images", () => {
  assert.equal(isAcceptedImageFile({ type: "image/heic", name: "IMG_1001.HEIC" }), true);
  assert.equal(isAcceptedImageFile({ type: "", name: "IMG_1001.heif" }), true);
  assert.equal(isHeicImage({ type: "", name: "IMG_1001.HEIC" }), true);
  assert.equal(shouldOptimizeImage({ byteSize: 9 * 1024 * 1024, width: 2000, height: 1500 }), true);
  assert.equal(shouldOptimizeImage({ byteSize: 1024, width: 1200, height: 800 }), false);
  assert.equal(uploadProgressLabel({ currentFile: 2, totalFiles: 3, stage: "正在上传", percent: 45 }), "2/3 · 正在上传 45%");
});
