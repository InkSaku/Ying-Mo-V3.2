const snapshots = new Map();
const MAX_AGE_MS = 15 * 60 * 1000;

export function canAnimateArticleNavigation() {
  return typeof document.startViewTransition === "function"
    && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function navigateWithArticleTransition(navigate, readySelector) {
  if (!canAnimateArticleNavigation()) {
    navigate();
    return;
  }
  void document.startViewTransition(async () => {
    navigate();
    await new Promise((resolve) => {
      let timer;
      const observer = new MutationObserver(() => {
        if (!document.querySelector(readySelector)) return;
        observer.disconnect();
        window.clearTimeout(timer);
        resolve();
      });
      observer.observe(document.getElementById("root"), { childList: true, subtree: true });
      timer = window.setTimeout(() => {
        observer.disconnect();
        resolve();
      }, 1200);
      if (document.querySelector(readySelector)) {
        observer.disconnect();
        window.clearTimeout(timer);
        resolve();
      }
    });
  });
}

export function rememberArticleBrowse({ locationKey, userId, path, result, postId }) {
  if (!locationKey || !userId || !result?.data) return;
  document.querySelectorAll(".browse-page-article h3, .browse-page-article .articles-lead-visual")
    .forEach((element) => { element.style.viewTransitionName = "none"; });
  document.querySelectorAll(".browse-page-article .is-opening")
    .forEach((element) => element.classList.remove("is-opening"));
  const row = document.querySelector(`[data-article-id="${postId}"]`);
  row?.classList.add("is-opening");
  const title = row?.querySelector("h3");
  if (title) title.style.viewTransitionName = "article-title";
  const cover = row?.querySelector(".articles-lead-visual");
  if (cover && result.data.find((item) => item.id === postId)?.cover_media) {
    cover.style.viewTransitionName = "article-cover";
  }
  snapshots.set(locationKey, {
    userId,
    path,
    result,
    postId,
    rowTop: row?.getBoundingClientRect().top ?? null,
    scrollY: window.scrollY,
    savedAt: Date.now(),
  });
  if (snapshots.size > 8) snapshots.delete(snapshots.keys().next().value);
}

export function articleBrowseSnapshot(locationKey, userId, path) {
  const snapshot = snapshots.get(locationKey);
  if (!snapshot || snapshot.userId !== userId || snapshot.path !== path) return null;
  if (Date.now() - snapshot.savedAt > MAX_AGE_MS) {
    snapshots.delete(locationKey);
    return null;
  }
  return snapshot;
}

export function restoreArticleBrowse(snapshot) {
  if (!snapshot) return;
  const row = document.querySelector(`[data-article-id="${snapshot.postId}"]`);
  const top = row && snapshot.rowTop !== null
    ? window.scrollY + row.getBoundingClientRect().top - snapshot.rowTop
    : snapshot.scrollY;
  window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
}

export function clearArticleBrowseSnapshots() {
  snapshots.clear();
}
