import { useEffect, useState } from "react";
import { createProtectedMediaUrl, revokeProtectedMediaUrl } from "../lib/protectedMedia";

export function useProtectedMedia(path) {
  const [state, setState] = useState({ src: null, loading: Boolean(path), error: null });

  useEffect(() => {
    const controller = new AbortController();
    let currentUrl = null;
    let active = true;

    if (!path) {
      setState({ src: null, loading: false, error: null });
      return () => controller.abort();
    }

    setState({ src: null, loading: true, error: null });
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
  }, [path]);

  return state;
}
