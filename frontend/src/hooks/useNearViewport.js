import { useEffect, useRef, useState } from "react";

const PRELOAD_MARGIN = "600px";

export function useNearViewport(initiallyNear = false) {
  const ref = useRef(null);
  const [near, setNear] = useState(initiallyNear || typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const element = ref.current;
    if (near || !element) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setNear(true);
    }, { rootMargin: PRELOAD_MARGIN });
    observer.observe(element);
    return () => observer.disconnect();
  }, [near]);

  return [ref, near];
}
