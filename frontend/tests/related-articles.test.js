import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";


test("compact related Article cards keep their explainable reasons visible", async () => {
  const [component, styles] = await Promise.all([
    readFile(new URL("../src/components/PostCard.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/styles/index.css", import.meta.url), "utf8"),
  ]);

  assert.match(component, /post\.related_reasons\?\.length/);
  assert.match(component, /className="post-card-reasons"/);
  assert.match(
    styles,
    /\.post-card-compact\.article-card \.post-card-content > p:not\(\.post-card-reasons\)\s*\{\s*display:\s*none;/,
  );
});
