import { gzipSync } from "node:zlib";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const DIST_DIR = path.resolve("dist");
const MANIFEST_PATH = path.join(DIST_DIR, ".vite", "manifest.json");
const PAGE_CHUNK_BUDGET = 150 * 1024;
const INITIAL_ROUTE_BUDGET = 300 * 1024;

const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
const records = Object.entries(manifest);
const entry = records.find(([, record]) => record.isEntry);
const pageEntries = records.filter(([, record]) => record.isDynamicEntry && record.file.endsWith(".js"));

if (!entry) {
  throw new Error("构建产物缺少入口清单，无法校验首屏体积。");
}

if (pageEntries.length < 10) {
  throw new Error(`仅检测到 ${pageEntries.length} 个异步页面入口，路由级拆包可能已失效。`);
}

const gzipSizes = new Map();

async function gzipSize(file) {
  if (!file.endsWith(".js")) return 0;
  if (!gzipSizes.has(file)) {
    const content = await readFile(path.join(DIST_DIR, file));
    gzipSizes.set(file, gzipSync(content).byteLength);
  }
  return gzipSizes.get(file);
}

function collectImports(key, collected = new Set()) {
  if (!key || collected.has(key)) return collected;
  const record = manifest[key];
  if (!record) return collected;
  collected.add(key);
  for (const imported of record.imports || []) collectImports(imported, collected);
  return collected;
}

const [entryKey] = entry;
let largestPage = { key: "", bytes: 0 };
let largestInitialRoute = { key: "", bytes: 0 };

for (const [key, record] of pageEntries) {
  const pageBytes = await gzipSize(record.file);
  if (pageBytes > largestPage.bytes) largestPage = { key, bytes: pageBytes };
  if (pageBytes > PAGE_CHUNK_BUDGET) {
    throw new Error(`${key} 的异步页面包为 ${(pageBytes / 1024).toFixed(2)} KiB gzip，超过 150 KiB。`);
  }

  const routeImports = new Set([...collectImports(entryKey), ...collectImports(key)]);
  let routeBytes = 0;
  for (const importKey of routeImports) routeBytes += await gzipSize(manifest[importKey]?.file || "");
  if (routeBytes > largestInitialRoute.bytes) largestInitialRoute = { key, bytes: routeBytes };
  if (routeBytes > INITIAL_ROUTE_BUDGET) {
    throw new Error(`${key} 的首次路由 JS 为 ${(routeBytes / 1024).toFixed(2)} KiB gzip，超过 300 KiB。`);
  }
}

const totalJsBytes = [...gzipSizes.keys()].reduce(async (sumPromise, file) => {
  const sum = await sumPromise;
  return sum + (await stat(path.join(DIST_DIR, file))).size;
}, Promise.resolve(0));

console.log(
  `BUNDLE_VERIFY_OK pages=${pageEntries.length}`,
  `largest_page=${largestPage.key}:${(largestPage.bytes / 1024).toFixed(2)}KiB_gzip`,
  `largest_initial=${largestInitialRoute.key}:${(largestInitialRoute.bytes / 1024).toFixed(2)}KiB_gzip`,
  `measured_js=${((await totalJsBytes) / 1024).toFixed(2)}KiB_raw`,
);
