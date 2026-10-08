import assert from "node:assert/strict";
import test from "node:test";
import { homeCollagePhotos, homeFeaturePost } from "../src/lib/homeComposition.js";

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

test("home opening chooses an available image article, then falls back to real feed content", () => {
  const note = { id: 1, post_type: "note", display_media: { read_path: "/media/note" } };
  const article = { id: 2, post_type: "article" };
  const imageArticle = { id: 3, post_type: "article", cover_media: { read_path: "/media/article" } };
  assert.equal(homeFeaturePost([note, article, imageArticle]), imageArticle);
  assert.equal(homeFeaturePost([note, article]), note);
  assert.equal(homeFeaturePost([article, { id: 4, post_type: "note" }]), article);
  assert.equal(homeFeaturePost([{ id: 4, post_type: "note" }]).id, 4);
  assert.equal(homeFeaturePost([]), null);
});
