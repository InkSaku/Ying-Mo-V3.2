import assert from "node:assert/strict";
import test from "node:test";
import { articleSlugFromTitle, articleSlugWithSuffix, updateTitleAndSlug, usesAutomaticArticleSlug } from "../src/lib/articleSlug.js";

test("turns Chinese, English and mixed article titles into readable URL segments", () => {
  assert.equal(articleSlugFromTitle("在海边慢慢读书"), "zai-hai-bian-man-man-du-shu");
  assert.equal(articleSlugFromTitle(" Hello World, 2026! "), "hello-world-2026");
  assert.equal(articleSlugFromTitle("Vue 3 入门"), "vue-3-ru-men");
  assert.equal(articleSlugFromTitle("女儿的旅行"), "nv-er-de-lv-xing");
  assert.equal(articleSlugFromTitle("Café & Déjà Vu"), "cafe-deja-vu");
});

test("handles blank, symbol-only and long titles within the stored URL limit", () => {
  assert.equal(articleSlugFromTitle("   "), "");
  assert.match(articleSlugFromTitle("🌙"), /^article-[a-z0-9]+$/);
  assert.equal(articleSlugFromTitle("🌙"), articleSlugFromTitle("🌙"));
  const slug = articleSlugFromTitle("旅行 ".repeat(100));
  assert.ok(slug.length <= 180);
  assert.match(slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  const alternative = articleSlugWithSuffix(slug, "123-2");
  assert.ok(alternative.length <= 180);
  assert.match(alternative, /^[a-z0-9]+(?:-[a-z0-9]+)*-123-2$/);
});

test("keeps draft URLs in sync but preserves manually edited and published URLs", () => {
  const form = { post_type: "article", title: "旧标题", slug: "jiu-biao-ti", slug_auto: true };
  assert.equal(updateTitleAndSlug(form, "新标题").slug, "xin-biao-ti");
  assert.equal(updateTitleAndSlug({ ...form, slug: "my-story", slug_auto: false }, "新标题").slug, "my-story");
  assert.equal(updateTitleAndSlug(form, "新标题", true).slug, "jiu-biao-ti");
  assert.equal(updateTitleAndSlug({ ...form, post_type: "note", slug: "" }, "新标题").slug, "");
  assert.equal(updateTitleAndSlug(form, "").slug, "");
});

test("recognizes automatic URLs in older restored forms without mode metadata", () => {
  assert.equal(usesAutomaticArticleSlug({ title: "旧标题", slug: "jiu-biao-ti" }), true);
  assert.equal(usesAutomaticArticleSlug({ title: "旧标题", slug: "" }), true);
  assert.equal(usesAutomaticArticleSlug({ title: "旧标题", slug: "custom-url" }), false);
});
