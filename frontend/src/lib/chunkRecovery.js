const RELOAD_KEY = "yingmo:chunk-reload-at";
const RELOAD_COOLDOWN_MS = 30_000;

function reloadOnce() {
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY)) || 0;
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return;
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Without storage a reload could loop forever; leave recovery to the error page.
    return;
  }
  window.location.reload();
}

// A release removes old hashed chunks, so a page opened before it can fail to load the next route.
export function initializeChunkRecovery() {
  window.addEventListener("vite:preloadError", () => {
    // Never reload over an open editor: unsaved words matter more than the missing chunk.
    if (window.location.pathname.startsWith("/write")) return;
    reloadOnce();
  });
}
