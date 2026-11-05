import { api } from "./api";

// Browsers allow about six HTTP/1.1 connections per host; keep some free for API requests.
const MAX_CONCURRENT_REQUESTS = 4;
const RETAIN_MS = 10 * 60_000;
const RETAIN_MAX_BYTES = 64 * 1024 * 1024;

const entriesByPath = new Map();
const pathsByUrl = new Map();
const pendingEntries = [];
// Idle entries in release order, so the oldest is evicted first.
const retainedEntries = new Set();
let retainedBytes = 0;
let activeRequests = 0;
let cacheGeneration = 0;

function abortedError() {
  const error = new Error("Protected media request was aborted.");
  error.code = "REQUEST_ABORTED";
  return error;
}

function startEntry(entry) {
  const requestGeneration = cacheGeneration;
  activeRequests += 1;
  api.blob(entry.path, { signal: entry.controller.signal }).then((result) => {
    if (entry.controller.signal.aborted || requestGeneration !== cacheGeneration) throw abortedError();
    entry.size = result.data.size;
    entry.url = URL.createObjectURL(result.data);
    pathsByUrl.set(entry.url, entry.path);
    entry.resolve(entry.url);
  }).catch((error) => {
    if (entriesByPath.get(entry.path) === entry) entriesByPath.delete(entry.path);
    entry.reject(error);
  }).finally(() => {
    activeRequests -= 1;
    startPendingEntries();
  });
}

function startPendingEntries() {
  while (activeRequests < MAX_CONCURRENT_REQUESTS && pendingEntries.length) {
    startEntry(pendingEntries.shift());
  }
}

function reclaimEntry(entry) {
  if (!retainedEntries.delete(entry)) return;
  retainedBytes -= entry.size;
  globalThis.clearTimeout(entry.releaseTimer);
  entry.releaseTimer = null;
}

function evictEntry(entry) {
  reclaimEntry(entry);
  URL.revokeObjectURL(entry.url);
  pathsByUrl.delete(entry.url);
  if (entriesByPath.get(entry.path) === entry) entriesByPath.delete(entry.path);
}

function retainEntry(entry) {
  retainedEntries.add(entry);
  retainedBytes += entry.size;
  entry.releaseTimer = globalThis.setTimeout(() => evictEntry(entry), RETAIN_MS);
  while (retainedBytes > RETAIN_MAX_BYTES) {
    evictEntry(retainedEntries.values().next().value);
  }
}

function releaseEntry(entry) {
  if (entriesByPath.get(entry.path) !== entry) return;
  entry.references = Math.max(0, entry.references - 1);
  if (entry.references) return;
  if (entry.url) {
    if (!retainedEntries.has(entry)) retainEntry(entry);
    return;
  }
  // The last waiting consumer left; free queued work or abort the in-flight fetch.
  const index = pendingEntries.indexOf(entry);
  if (index !== -1) pendingEntries.splice(index, 1);
  if (entriesByPath.get(entry.path) === entry) entriesByPath.delete(entry.path);
  entry.controller.abort();
  entry.reject(abortedError());
}

function waitForEntry(entry, signal) {
  if (!signal) return entry.promise;
  return new Promise((resolve, reject) => {
    let waiting = true;
    const abort = () => {
      if (!waiting) return;
      waiting = false;
      signal.removeEventListener("abort", abort);
      releaseEntry(entry);
      reject(abortedError());
    };
    signal.addEventListener("abort", abort, { once: true });
    const settle = (complete, result) => {
      if (!waiting) return;
      waiting = false;
      signal.removeEventListener("abort", abort);
      complete(result);
    };
    entry.promise.then((url) => settle(resolve, url), (error) => settle(reject, error));
  });
}

export function peekProtectedMediaUrl(path) {
  return entriesByPath.get(path)?.url ?? null;
}

export async function createProtectedMediaUrl(path, { signal } = {}) {
  if (!path) return null;
  if (signal?.aborted) throw abortedError();

  let entry = entriesByPath.get(path);
  if (entry) {
    entry.references += 1;
    reclaimEntry(entry);
  } else {
    entry = { path, references: 1, releaseTimer: null, url: null, size: 0, controller: new AbortController(), promise: null };
    entry.promise = new Promise((resolve, reject) => {
      entry.resolve = resolve;
      entry.reject = reject;
    });
    entriesByPath.set(path, entry);
    pendingEntries.push(entry);
  }

  const result = waitForEntry(entry, signal);
  startPendingEntries();
  return result;
}

export function revokeProtectedMediaUrl(url) {
  const path = pathsByUrl.get(url);
  const entry = path ? entriesByPath.get(path) : null;
  if (!entry || entry.url !== url) return;
  releaseEntry(entry);
}

export async function preloadProtectedMedia(path, { signal } = {}) {
  const url = await createProtectedMediaUrl(path, { signal });
  revokeProtectedMediaUrl(url);
}

export function revokeAllProtectedMedia() {
  cacheGeneration += 1;
  pendingEntries.length = 0;
  entriesByPath.forEach((entry) => {
    globalThis.clearTimeout(entry.releaseTimer);
    entry.controller.abort();
    entry.reject(abortedError());
    if (entry.url) URL.revokeObjectURL(entry.url);
  });
  entriesByPath.clear();
  pathsByUrl.clear();
  retainedEntries.clear();
  retainedBytes = 0;
}
