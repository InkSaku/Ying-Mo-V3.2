import assert from "node:assert/strict";
import test from "node:test";
import { IMAGE_ACCEPT, isAcceptedImageFile, prepareImageForUpload } from "../src/lib/imageUpload.js";

test("image pickers accept common raster formats, missing MIME and JPEG aliases", () => {
  for (const name of ["photo.JPG", "photo.JPEG", "photo.jpe", "photo.jfif", "photo.png", "photo.webp", "photo.heic", "photo.heif", "photo.gif", "photo.bmp", "scan.tif", "scan.tiff", "photo.avif"]) {
    assert.equal(isAcceptedImageFile({ name, type: "" }), true, name);
    assert.equal(isAcceptedImageFile({ name, type: "application/octet-stream" }), true, name);
    assert.ok(IMAGE_ACCEPT.includes(`.${name.split(".").at(-1).toLowerCase()}`));
  }
  for (const type of ["image/pjpeg", "image/jpg", "IMAGE/JPEG; charset=binary", "image/x-ms-bmp", "image/x-tiff"]) {
    assert.equal(isAcceptedImageFile({ name: "clipboard", type }), true, type);
  }
});

test("non-images and click events cannot be passed as uploaded files", async () => {
  for (const file of [null, { name: "document.pdf", type: "application/pdf" }, { name: "icon.svg", type: "image/svg+xml" }, { type: "click", target: {} }]) {
    assert.equal(isAcceptedImageFile(file), false);
    await assert.rejects(prepareImageForUpload(file), /图片格式暂不支持/);
  }
});

test("animated GIF and multi-page TIFF originals bypass browser optimization", async (t) => {
  const original = globalThis.createImageBitmap;
  globalThis.createImageBitmap = () => { throw new Error("must not decode preserved originals"); };
  t.after(() => {
    if (original) globalThis.createImageBitmap = original;
    else delete globalThis.createImageBitmap;
  });
  for (const [name, type] of [["animation.gif", "image/gif"], ["scan.tif", "image/tiff"]]) {
    const file = { name, type, size: 10 * 1024 * 1024 };
    const result = await prepareImageForUpload(file);
    assert.equal(result.file, file);
    assert.equal(result.optimized, false);
  }
});
