import test from "node:test";
import assert from "node:assert/strict";
import {
  galleryPosition,
  logicalMediaFromRaw,
  logicalMediaFromPostDisplay,
  mergeMediaItems,
  withMediaParam,
} from "../src/lib/mediaGallery.js";

test("groups a Live Photo pair into one stable logical media item", () => {
  const pair = "pair-1";
  const post = { id: 7, semantic_time: "2026-05-18T10:00:00Z", location: "杭州", author: { nickname: "Alice" } };
  const items = logicalMediaFromRaw([
    { id: 1, public_id: "image-1", kind: "live_photo_image", live_photo_pair_id: pair, read_path: "/image" },
    { id: 2, public_id: "video-1", kind: "live_photo_video", live_photo_pair_id: pair, read_path: "/video" },
  ], post);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "image-1");
  assert.equal(items[0].kind, "live_photo");
  assert.equal(items[0].video.public_id, "video-1");
  assert.equal(items[0].location, "杭州");
});

test("builds a gallery item from post display media", () => {
  const item = logicalMediaFromPostDisplay({
    id: 8,
    semantic_time: "2024-01-01T00:00:00Z",
    display_media: { public_id: "photo-8", read_path: "/photo-8" },
  });
  assert.equal(item.id, "photo-8");
  assert.equal(item.kind, "image");
});

test("preserves page filters while adding and removing a media deep link", () => {
  const opened = withMediaParam("?view=media&year=2026&page=3", "photo-9");
  assert.equal(opened, "?view=media&year=2026&page=3&media=photo-9");
  assert.equal(withMediaParam(opened, null), "?view=media&year=2026&page=3");
});

test("merges paginated media without duplicate ids and keeps global positions", () => {
  const merged = mergeMediaItems([{ id: "b" }, { id: "c" }], [{ id: "a" }, { id: "b" }], { prepend: true });
  assert.deepEqual(merged.map((item) => item.id), ["a", "b", "c"]);
  assert.equal(galleryPosition(24, 2), 27);
});
