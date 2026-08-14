import { api } from "./api";

const activeBlobUrls = new Set();

export async function createProtectedMediaUrl(path, { signal } = {}) {
  if (!path) return null;
  const result = await api.blob(path, { signal });
  const url = URL.createObjectURL(result.data);
  activeBlobUrls.add(url);
  return url;
}

export function revokeProtectedMediaUrl(url) {
  if (!url || !activeBlobUrls.has(url)) return;
  URL.revokeObjectURL(url);
  activeBlobUrls.delete(url);
}

export function revokeAllProtectedMedia() {
  activeBlobUrls.forEach((url) => URL.revokeObjectURL(url));
  activeBlobUrls.clear();
}
