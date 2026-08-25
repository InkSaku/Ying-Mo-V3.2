import { gzipSync } from "node:zlib";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const DIST_DIR = path.resolve("dist");
const MANIFEST_PATH = path.join(DIST_DIR, ".vite", "manifest.json");
const WEB_MANIFEST_PATH = path.join(DIST_DIR, "app.webmanifest");
const SERVICE_WORKER_PATH = path.join(DIST_DIR, "sw.js");
const PAGE_CHUNK_BUDGET = 150 * 1024;
const INITIAL_ROUTE_BUDGET = 300 * 1024;

const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
const webManifest = JSON.parse(await readFile(WEB_MANIFEST_PATH, "utf8"));
const serviceWorker = await readFile(SERVICE_WORKER_PATH, "utf8");
const records = Object.entries(manifest);
const entry = records.find(([, record]) => record.isEntry);
const pageEntries = records.filter(([, record]) => record.isDynamicEntry && record.file.endsWith(".js"));

if (!entry) {
  throw new Error("构建产物缺少入口清单，无法校验首屏体积。");
}

if (webManifest.display !== "standalone" || webManifest.start_url !== "/home?source=pwa") {
  throw new Error("PWA Web App Manifest 缺少独立窗口或安全启动页配置。");
}

if (!Array.isArray(webManifest.icons) || !webManifest.icons.some((icon) => icon.purpose === "maskable")) {
  throw new Error("PWA Web App Manifest 缺少 maskable 应用图标。");
}

if (!Array.isArray(webManifest.shortcuts) || webManifest.shortcuts.length < 3) {
  throw new Error("PWA Web App Manifest 缺少创作与搜索快捷入口。");
}

const precacheUrls = [...serviceWorker.matchAll(/url:"([^"]+)"/g)].map((match) => match[1]);
if (precacheUrls.some((url) => url.startsWith("api/") || url.startsWith("/api/"))) {
  throw new Error("Service Worker 产物不得预缓存 API 或受保护媒体路径。");
}

if (!serviceWorker.includes("denylist:[/^\\/api")) {
  throw new Error("Service Worker 导航回退必须显式排除 API 路径。");
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
