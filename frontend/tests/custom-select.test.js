import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const srcRoot = fileURLToPath(new URL("../src/", import.meta.url));

async function jsxFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return jsxFiles(target);
    return entry.isFile() && entry.name.endsWith(".jsx") ? [target] : [];
  }));
  return nested.flat();
}

test("Design System 不允许重新引入原生 select", async () => {
  const files = await jsxFiles(srcRoot);
  const violations = [];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (/<select\b/i.test(source)) {
      violations.push(path.relative(srcRoot, file));
    }
  }

  assert.deepEqual(
    violations,
    [],
    `以下文件仍使用原生 <select>：${violations.join(", ")}`
  );
});
