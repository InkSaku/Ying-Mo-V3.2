export const READING_DWELL_MS = 5000;

export function installVisibleReadTracker({
  postId,
  onRead,
  dwellMs = READING_DWELL_MS,
  documentRef = typeof document === "undefined" ? null : document,
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = (timerId) => clearTimeout(timerId),
} = {}) {
  if (!postId || typeof onRead !== "function" || !documentRef) {
    return () => {};
  }

  let timerId = null;
  let disposed = false;
  let attempted = false;

  const clearPending = () => {
    if (timerId === null) return;
    clearTimer(timerId);
    timerId = null;
  };

  const arm = () => {
    if (
      disposed
      || attempted
      || timerId !== null
      || documentRef.visibilityState !== "visible"
    ) {
      return;
    }

    timerId = setTimer(() => {
      timerId = null;
      if (
        disposed
        || attempted
        || documentRef.visibilityState !== "visible"
      ) {
        return;
      }

      attempted = true;
      Promise.resolve(onRead(postId)).catch(() => undefined);
    }, dwellMs);
  };

  const handleVisibilityChange = () => {
    if (documentRef.visibilityState === "visible") {
      arm();
    } else {
      clearPending();
    }
  };

  documentRef.addEventListener("visibilitychange", handleVisibilityChange);
  arm();

  return () => {
    disposed = true;
    clearPending();
    documentRef.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}
