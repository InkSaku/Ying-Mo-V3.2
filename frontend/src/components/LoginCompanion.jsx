import { useEffect, useRef } from "react";
import "../styles/ink-sketches.css";
import "../styles/login-companion.css";

function useReaderGaze(ref, enabled) {
  useEffect(() => {
    if (!enabled) return undefined;
    const element = ref.current;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    let frame = 0;
    let bounds;
    let position;

    const measure = () => { bounds = element.getBoundingClientRect(); };
    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      element.style.removeProperty("--reader-look-x");
      element.style.removeProperty("--reader-look-y");
      element.style.removeProperty("--reader-lean");
    };
    const follow = (event) => {
      if (motion.matches || !pointer.matches || event.pointerType !== "mouse" || document.hidden) return;
      position = { x: event.clientX, y: event.clientY };
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const x = Math.max(-1, Math.min(1, (position.x - bounds.left - bounds.width * .47) / 260));
        const y = Math.max(-1, Math.min(1, (position.y - bounds.top - bounds.height * .37) / 220));
        element.style.setProperty("--reader-look-x", `${(x * 3).toFixed(2)}px`);
        element.style.setProperty("--reader-look-y", `${(y * 2).toFixed(2)}px`);
        element.style.setProperty("--reader-lean", `${(x * 3).toFixed(2)}deg`);
      });
    };
    measure();
    window.addEventListener("pointermove", follow, { passive: true });
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true, capture: true });
    window.addEventListener("blur", reset);
    document.addEventListener("pointerleave", reset);
    document.addEventListener("visibilitychange", reset);
    motion.addEventListener("change", reset);
    pointer.addEventListener("change", reset);
    return () => {
      reset();
      window.removeEventListener("pointermove", follow);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("blur", reset);
      document.removeEventListener("pointerleave", reset);
      document.removeEventListener("visibilitychange", reset);
      motion.removeEventListener("change", reset);
      pointer.removeEventListener("change", reset);
    };
  }, [ref, enabled]);
}

// The original slow-reader drawing, separated into movable layers.
// An opaque book sits in front of the face; its hands travel with it.
export function LoginCompanion({ pose = "welcome", trackPointer = true, className = "" }) {
  const ref = useRef(null);
  useReaderGaze(ref, trackPointer);

  return <span ref={ref} className={`ink-sketch login-companion ${className}`} data-pose={pose} aria-hidden="true">
    <svg className="login-reader" viewBox="0 0 240 220" fill="none" focusable="false">
      <g className="reader-lines">
        <path d="M154 94c14-8 26-6 27 9l-5 63c-16 8-41 9-67 4M177 164l9 27m-65-19-5 22M97 163c21-4 49-2 77 1M176 109l10-9" />
        <path d="M96 163c-2 13-11 18-22 19-7 1-8 7 0 8l28 1m22-24c5 13 14 16 26 14 9-1 10 5 3 8l-26 4" />
        <path d="M23 165c14-2 28-1 39 1m-26 1-4 27m20-27 5 24M31 148l2 13c6 3 13 3 18 0l2-14c-6-2-15-2-22 1Zm22 2c10-3 13 8-2 9M39 139c-5-5 5-8 0-13" />
        <path d="M33 202c39-3 88-2 134-1m12 1 21 1" opacity=".35" />
      </g>
      <path className="reader-body" d="M94 104c-6 15-12 38-4 54 17 7 37 7 56-1 7-14 0-38-9-51Z" fill="currentColor" />
      <g className="reader-arrival">
        <g className="reader-head">
          <path d="M79 111c-9-7-10-21-5-33 6-17 18-30 35-33 17-4 35 4 43 20 7 13 8 29 0 43-11-1-22 1-32 7-14-8-28-10-41-4Z" fill="currentColor" />
          <g className="reader-face">
            <g className="reader-eyes reader-eyes-open"><path d="m99 83 1 4m24-4 1 4" /></g>
            <g className="reader-eyes reader-eyes-closed"><path d="M97 85q3 4 6 0m19 0q3 4 6 0" /></g>
            <path d="m105 98c5 4 10 4 14-1" />
          </g>
        </g>
      </g>
      <g className="reader-lines reader-raised-arms"><path d="M87 116C64 112 59 89 64 73m82 44c28-2 39-22 34-42" /></g>
      <g className="reader-book reader-lines">
        <path className="reader-book-paper" d="M63 112c18-9 38-8 57 3 19-9 40-9 61-1l-8 40c-20-7-36-4-55 6-16-10-33-13-50-9l-5-39Z" />
        <path d="m120 115-2 45M70 119c15-5 29-3 42 4m-40 7c14-3 25-1 35 3m25-10c13-5 25-6 39-2m-40 12c12-5 23-5 36-3M68 155c17-3 31 1 49 10 20-11 39-12 56-7" />
        <g className="reader-bookmark reader-accent"><path d="m148 119-2 27 6-4 5 4 3-28" /></g>
        <g className="reader-hands">
          <path d="M66 127c-8-3-9 2-4 5-7-2-8 4-1 6-5 0-3 6 6 5" />
          <path className="reader-hand-right" d="M177 130c8-3 10 2 4 5 7-1 7 4 0 6 5 1 3 5-7 4" />
        </g>
      </g>
      <g className="reader-accent reader-hello"><path d="M79 34c3-8 7-12 12-15m-28 21-8-5m80-11 3-9" /></g>
      <g className="reader-accent reader-cover-marks"><path d="m73 35-4-7m83 6 5-7" /></g>
      <g className="reader-accent reader-question"><path d="M181 57c-1-10 17-12 18-2 1 7-10 8-10 15m0 7v1" /></g>
      <g className="reader-accent reader-star"><path d="m190 51 3 8 9 3-9 3-3 9-3-9-8-3 8-3 3-8Z" /></g>
    </svg>
  </span>;
}
