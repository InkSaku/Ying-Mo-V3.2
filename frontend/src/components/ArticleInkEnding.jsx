import { useEffect, useRef, useState } from "react";
import { InkSketch } from "./InkSketch";
import { createInkScatter, prefersReducedMotion, sampleSvgTargets, smoothstep } from "../lib/inkScatter";
import "../styles/ink-passage.css";

// The end of an article: its title flakes into ink dots that gather into the
// slow reader, once, when the reader actually reaches the end.
export function ArticleInkEnding({ title }) {
  const rootRef = useRef(null);
  const lineRef = useRef(null);
  const artRef = useRef(null);
  const canvasRef = useRef(null);
  const [phase, setPhase] = useState(() => (prefersReducedMotion() || typeof IntersectionObserver === "undefined" ? "done" : "waiting"));

  useEffect(() => {
    if (rootRef.current?.dataset.phase !== "waiting") return undefined;
    let cancelled = false;
    let raf = 0;
    const settle = () => { if (!cancelled) setPhase("done"); };

    const play = async () => {
      const svg = artRef.current?.querySelector("svg");
      const canvas = canvasRef.current;
      if (!svg || !canvas || prefersReducedMotion() || document.hidden) { settle(); return; }
      const frame = canvas.getBoundingClientRect();
      const ink = getComputedStyle(lineRef.current).color;
      const scatter = createInkScatter(canvas, frame, { ink });
      // Both read layout in this same task, so scrolling cannot skew them.
      const [count, points] = await Promise.all([
        scatter.prepareSource([lineRef.current], { cellSize: 1.7, sweepDuration: 520 }),
        sampleSvgTargets(svg, { cellSize: 1.9 }),
      ]);
      if (cancelled) return;
      if (!count || !points.length) { settle(); return; }
      scatter.setTargets(points, { start: 720, stagger: 260, duration: 680, size: 1.9 });
      scatter.draw(0);
      setPhase("playing");
      const start = performance.now();
      const tick = (now) => {
        if (cancelled) return;
        const t = now - start;
        const fade = smoothstep(scatter.arrival + 40, scatter.arrival + 420, t);
        if (t > scatter.arrival + 40) settle();
        if (fade >= 1) { canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height); return; }
        scatter.draw(t, { dots: 1 - fade });
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      play().catch(settle);
    }, { threshold: 1, rootMargin: "0px 0px -10% 0px" });
    observer.observe(rootRef.current);
    return () => {
      cancelled = true;
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return <div ref={rootRef} className="article-ink-ending" data-phase={phase}>
    <div className="article-ink-ending-stage" aria-hidden="true">
      <p ref={lineRef} className="article-ink-ending-line">{title || "未命名文章"}</p>
      <div ref={artRef} className="article-ink-ending-art"><InkSketch variant="reader" /></div>
    </div>
    <p className="article-ink-ending-mark">全文完</p>
    <canvas ref={canvasRef} className="article-ink-ending-canvas" aria-hidden="true" />
  </div>;
}
