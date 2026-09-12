import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  desktopPrimaryNavItems,
  discoveryNavItems,
  mobilePrimaryNavItems,
  pathMatches,
  pathMatchesAny,
} from "../src/lib/navigation.js";

test("global navigation keeps the agreed desktop and mobile hierarchy", () => {
  assert.deepEqual(desktopPrimaryNavItems.map((item) => item.label), ["首页", "漫游", "合集"]);
  assert.deepEqual(discoveryNavItems.map((item) => item.label), ["文章", "随记", "分类", "标签", "归档", "搜索"]);
  assert.deepEqual(mobilePrimaryNavItems.map((item) => item.label), ["首页", "发现", "写作", "我的"]);
  assert.equal(pathMatches("/collections/a-memory", "/collections"), true);
  assert.equal(pathMatches("/collection", "/collections"), false);
  assert.equal(pathMatchesAny("/articles/a-post", ["/articles", "/notes"]), true);
});

async function cssFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return cssFiles(absolute);
    return entry.name.endsWith(".css") ? [absolute] : [];
  }));
  return nested.flat();
}

test("stylesheet variables resolve through the shared design token layer", async () => {
  const files = await cssFiles(fileURLToPath(new URL("../src/styles", import.meta.url)));
  const source = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
  const references = new Set([...source.matchAll(/var\(\s*(--[\w-]+)/g)].map((match) => match[1]));
  const definitions = new Set([...source.matchAll(/(^|[;{])\s*(--[\w-]+)\s*:/gm)].map((match) => match[2]));
  const runtimeVariables = new Set(["--home-header-height", "--reading-progress"]);
  const unresolved = [...references]
    .filter((name) => !definitions.has(name) && !runtimeVariables.has(name))
    .sort();

  assert.deepEqual(unresolved, []);
  for (const token of ["--paper", "--ink", "--muted", "--border-strong", "--reading-max", "--form-max"]) {
    assert.equal(definitions.has(token), true, `${token} should be part of the shared token layer`);
  }
});
