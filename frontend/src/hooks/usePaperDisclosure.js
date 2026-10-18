import { useLayoutEffect, useRef } from "react";
import { PAPER_EASE, paperMotionAllowed } from "../lib/paperMotion";

// Only explicit disclosure changes animate. Typing, uploads and restored drafts keep their layout.
export function usePaperDisclosure(state) {
  const ref = useRef(null);
  const beforeRef = useRef(null);
  const animationRef = useRef(null);
  const remember = () => {
    beforeRef.current = ref.current?.getBoundingClientRect().height ?? null;
    animationRef.current?.cancel();
  };
  useLayoutEffect(() => {
    const node = ref.current;
    const before = beforeRef.current;
    beforeRef.current = null;
    if (!node || before === null || !paperMotionAllowed()) return;
    const after = node.getBoundingClientRect().height;
    if (Math.abs(after - before) < 1) return;
    const animation = node.animate([
      { height: `${before}px`, overflow: "clip" },
      { height: `${after}px`, overflow: "clip" },
    ], { duration: after > before ? 260 : 200, easing: PAPER_EASE });
    animationRef.current = animation;
    return () => animation.cancel();
  }, [state]);
  useLayoutEffect(() => {
    const cancel = () => animationRef.current?.cancel();
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    window.addEventListener("resize", cancel);
    query.addEventListener("change", cancel);
    return () => { window.removeEventListener("resize", cancel); query.removeEventListener("change", cancel); cancel(); };
  }, []);
  return [ref, remember];
}
