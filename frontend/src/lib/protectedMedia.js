import { api } from "./api";

const CACHE_RELEASE_DELAY_MS = 15_000;
const entriesByPath = new Map();
const pathsByUrl = new Map();
let cacheGeneration = 0;

function abortedError() {
  const error = new Error("Protected media request was aborted.");
  error.code = "REQUEST_ABORTED";
  return error;
}

export async function createProtectedMediaUrl(path, { signal } = {}) {
  if (!path) return null;
  if (signal?.aborted) throw abortedError();

  let entry = entriesByPath.get(path);
  if (entry) {
    entry.references += 1;
    globalThis.clearTimeout(entry.releaseTimer);
    entry.releaseTimer = null;
  } else {
    const requestGeneration = cacheGeneration;
    entry = { references: 1, releaseTimer: null, url: null, promise: null };
    entry.promise = api.blob(path).then((result) => {
      if (requestGeneration !== cacheGeneration) throw abortedError();
      entry.url = URL.createObjectURL(result.data);
      pathsByUrl.set(entry.url, path);
      return entry.url;
    }).catch((error) => {
      if (entriesByPath.get(path) === entry) entriesByPath.delete(path);
      throw error;
    });
    entriesByPath.set(path, entry);
  }

  return entry.promise;
}

export function revokeProtectedMediaUrl(url) {
  const path = pathsByUrl.get(url);
  const entry = path ? entriesByPath.get(path) : null;
  if (!entry || entry.url !== url) return;
  entry.references = Math.max(0, entry.references - 1);
  if (entry.references || entry.releaseTimer) return;
  entry.releaseTimer = globalThis.setTimeout(() => {
    if (entry.references || entriesByPath.get(path) !== entry) return;
    URL.revokeObjectURL(url);
    pathsByUrl.delete(url);
    entriesByPath.delete(path);
  }, CACHE_RELEASE_DELAY_MS);
}

export async function preloadProtectedMedia(path, { signal } = {}) {
  const url = await createProtectedMediaUrl(path, { signal });
  revokeProtectedMediaUrl(url);
}

export function revokeAllProtectedMedia() {
  cacheGeneration += 1;
  entriesByPath.forEach((entry) => {
    globalThis.clearTimeout(entry.releaseTimer);
    if (entry.url) URL.revokeObjectURL(entry.url);
  });
  entriesByPath.clear();
  pathsByUrl.clear();
}
