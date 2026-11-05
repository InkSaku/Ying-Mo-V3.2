import { useEffect, useState } from "react";
import { createProtectedMediaUrl, peekProtectedMediaUrl, revokeProtectedMediaUrl } from "../lib/protectedMedia";

function initialState(path) {
  const src = path ? peekProtectedMediaUrl(path) : null;
  return { src, loading: Boolean(path) && !src, error: null };
}

export function useProtectedMedia(path, { defer = false } = {}) {
  const [state, setState] = useState(() => initialState(path));

  useEffect(() => {
    const controller = new AbortController();
    let currentUrl = null;
    let active = true;

    setState(initialState(path));
    if (!path || defer) return () => controller.abort();

    createProtectedMediaUrl(path, { signal: controller.signal })
      .then((url) => {
        currentUrl = url;
        if (active) setState({ src: url, loading: false, error: null });
        else revokeProtectedMediaUrl(url);
      })
      .catch((error) => {
        if (active && error?.code !== "REQUEST_ABORTED") {
          setState({ src: null, loading: false, error });
        }
      });

    return () => {
      active = false;
      controller.abort();
      revokeProtectedMediaUrl(currentUrl);
    };
  }, [path, defer]);

  return state;
}
