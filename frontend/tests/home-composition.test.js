import assert from "node:assert/strict";
import test from "node:test";
import { homeCollagePhotos } from "../src/lib/homeComposition.js";

test("home collage fills from available feed media without duplicating assets", () => {
  const posts = [
    { id: 1 },
    { id: 2, display_media: { read_path: "/api/v1/uploads/images/a" } },
    { id: 3, cover_media: { read_path: "/api/v1/uploads/images/a" } },
    { id: 4, cover_media: { thumbnail_path: "/api/v1/uploads/images/b/thumbnail" } },
  ];
  assert.deepEqual(homeCollagePhotos(posts).map(({ post }) => post.id), [2, 4]);
  assert.deepEqual(homeCollagePhotos(), []);
});

test("home collage has four slots and preserves source order", () => {
  const posts = Array.from({ length: 10 }, (_, id) => ({ id, display_media: { read_path: `/media/${id}` } }));
  assert.deepEqual(homeCollagePhotos(posts).map(({ post }) => post.id), [0, 1, 2, 3]);
  assert.equal(posts.length, 10);
});
