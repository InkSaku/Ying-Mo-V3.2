import { useEffect, useRef } from "react";
import ArchiveCatDrawing from "./ArchiveCatDrawing";
import "../styles/archive-cat.css";

export function ArticleOpeningSketch() {
  return (
    <svg className="article-opening-sketch" viewBox="0 0 230 250" aria-hidden="true" focusable="false">
      <g className="article-sketch-window">
        <path d="M30 30c41-5 86-4 131 1l-2 126c-43 3-84 2-126-2L30 30Z" />
        <path d="M38 40c38-4 75-3 113 0l-1 105c-37 3-74 2-110-1L38 40Z" />
        <path d="M94 37c-2 38-1 74 0 111M38 94c37 2 75 1 113-1" />
      </g>
      <g className="article-sketch-horizon">
        <path d="M40 118c19-11 35-12 51-4 20 10 35 7 58-8" />
        <path d="M41 126c21-8 37-7 53 0 17 7 34 3 55-9" />
        <path d="M103 66c9-7 21-5 27 4 6 10 2 23-8 28" />
      </g>
      <g className="article-sketch-desk">
        <path d="M13 184c51-4 105-4 165 2 14 1 27 1 39 0" />
        <path d="M24 193c52-2 107 1 170 8" />
        <path d="m60 175 64-18 7 8-61 18-15-2 5-6Z" />
        <path d="m122 158 8 8M60 175l10 8" />
        <path d="M155 184c3-17 10-30 23-41" />
        <path d="M169 158c-11-7-18-5-23 5 9 5 17 3 23-5ZM174 150c1-11 7-17 17-18 1 10-5 16-17 18Z" />
      </g>
      <g className="article-sketch-blue">
        <path d="M27 218c36 4 76 4 118-1" />
        <path d="M56 229c27 4 54 3 81-2" />
        <path d="m181 53 3 8 8 2-7 4v9l-6-6-8 3 4-8-5-7 9 1Z" />
      </g>
    </svg>
  );
}

export function ArticleTocSketch() {
  return (
    <svg className="article-toc-sketch" viewBox="0 0 180 86" aria-hidden="true" focusable="false">
      <g>
        <path d="M6 66c35-5 73-5 114 1 18 3 35 2 52-2" />
        <path d="M31 59c7-16 15-29 28-42" />
        <path d="M42 42c-11-6-19-4-25 5 10 5 18 3 25-5ZM51 29c2-11 8-17 19-18 0 10-7 16-19 18Z" />
        <path d="m83 52 57-35 9 9-58 34-13 1 5-9Z" />
        <path d="m138 19 9 9M83 52l8 8" />
      </g>
      <path className="article-toc-sketch-blue" d="M93 76c25 3 50 2 76-3" />
    </svg>
  );
}

export function ArticleEndMark() {
  return (
    <div className="article-end-mark" aria-hidden="true">
      <svg viewBox="0 0 210 54" focusable="false">
        <g>
          <path d="M4 34c28-7 55-6 82 0 29 7 58 6 92-3" />
          <path d="M18 41c30-4 59-1 87 3 29 4 60 1 99-8" />
          <path d="M73 29c2-7 9-10 16-7 5 2 8 6 8 11-10 1-18 0-24-4ZM142 31c2-5 7-8 13-6 4 1 7 5 7 9-8 1-15 0-20-3Z" />
        </g>
        <path className="article-end-mark-blue" d="M91 11c10 5 17 12 20 22m-4-5 4 6 5-6" />
      </svg>
    </div>
  );
}

export function ArticleArchiveCat() {
  const trackRef = useRef(null);
  const catRef = useRef(null);

  useEffect(() => {
    const track = trackRef.current;
    const cat = catRef.current;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let x = 0;
    let target = 0;
    let frame = 0;
    let previous = 0;
    let pointerX = null;
    const limit = () => Math.max(0, track.clientWidth - cat.offsetWidth);
    const paint = () => { cat.style.transform = `translateX(${x}px)`; };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      previous = 0;
      cat.dataset.running = "false";
    };
    const tick = (time) => {
      const dt = previous ? Math.min((time - previous) / 1000, .04) : 0;
      previous = time;
      const distance = target - x;
      if (Math.abs(distance) < 3) { stop(); return; }
      cat.dataset.direction = distance < 0 ? "left" : "right";
      cat.dataset.running = "true";
      x += Math.sign(distance) * Math.min(Math.abs(distance), 160 * dt);
      paint();
      frame = requestAnimationFrame(tick);
    };
    const follow = () => {
      if (motion.matches || pointerX === null) return;
      target = Math.max(0, Math.min(limit(), pointerX - track.getBoundingClientRect().left - cat.offsetWidth / 2));
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const onPointer = (event) => {
      if (event.pointerType === "touch") return;
      pointerX = event.clientX;
      follow();
    };
    const resize = new ResizeObserver(() => {
      x = Math.min(x, limit());
      target = Math.min(target, limit());
      paint();
      follow();
    });
    x = limit() * .68;
    target = x;
    paint();
    resize.observe(track);
    const onMotion = () => { if (motion.matches) stop(); else follow(); };
    const onVisibility = () => { if (document.hidden) stop(); };
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("blur", stop);
    document.documentElement.addEventListener("pointerleave", stop);
    document.addEventListener("visibilitychange", onVisibility);
    motion.addEventListener("change", onMotion);
    return () => {
      stop();
      resize.disconnect();
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("blur", stop);
      document.documentElement.removeEventListener("pointerleave", stop);
      document.removeEventListener("visibilitychange", onVisibility);
      motion.removeEventListener("change", onMotion);
    };
  }, []);

  return (
    <div ref={trackRef} className="article-archive-cat" aria-hidden="true">
      <div ref={catRef} className="article-archive-cat-runner" data-running="false" data-direction="right">
        <ArchiveCatDrawing />
      </div>
    </div>
  );
}
