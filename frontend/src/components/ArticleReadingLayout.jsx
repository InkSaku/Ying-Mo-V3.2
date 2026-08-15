import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  activeHeadingAt,
  calculateReadingProgress,
  hasArticleToc,
  normalizeArticleOutline,
} from "../lib/articleReading";

const HEADING_OFFSET = 96;

function decodeHash(value) {
  try {
    return decodeURIComponent(String(value || "").replace(/^#/, ""));
  } catch {
    return "";
  }
}

export function ArticleReadingLayout({ outline, children }) {
  const contentRef = useRef(null);
  const frameRef = useRef(0);
  const normalizedOutline = useMemo(() => normalizeArticleOutline(outline), [outline]);
  const showToc = hasArticleToc(normalizedOutline);
  const [activeId, setActiveId] = useState(normalizedOutline[0]?.id || "");
  const [progress, setProgress] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setActiveId(normalizedOutline[0]?.id || "");
    setMobileOpen(false);
  }, [normalizedOutline]);

  const updateReadingState = useCallback(() => {
    frameRef.current = 0;
    const content = contentRef.current;
    if (!content) return;
    const contentRect = content.getBoundingClientRect();
    const contentTop = window.scrollY + contentRect.top;
    setProgress(calculateReadingProgress({
      scrollTop: window.scrollY + HEADING_OFFSET,
      contentTop,
      contentHeight: contentRect.height,
      viewportHeight: window.innerHeight - HEADING_OFFSET,
    }));
    if (showToc) {
      const positions = normalizedOutline.map((item) => {
        const heading = document.getElementById(item.id);
        return { id: item.id, top: heading ? window.scrollY + heading.getBoundingClientRect().top : Number.POSITIVE_INFINITY };
      });
      setActiveId(activeHeadingAt(positions, window.scrollY + HEADING_OFFSET + 2));
    }
  }, [normalizedOutline, showToc]);

  useEffect(() => {
    const queueUpdate = () => {
      if (!frameRef.current) frameRef.current = window.requestAnimationFrame(updateReadingState);
    };
    queueUpdate();
    window.addEventListener("scroll", queueUpdate, { passive: true });
    window.addEventListener("resize", queueUpdate);
    window.addEventListener("hashchange", queueUpdate);
    window.addEventListener("popstate", queueUpdate);
    document.addEventListener("scroll", queueUpdate, { capture: true, passive: true });
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(queueUpdate);
    if (contentRef.current) resizeObserver?.observe(contentRef.current);
    return () => {
      window.removeEventListener("scroll", queueUpdate);
      window.removeEventListener("resize", queueUpdate);
      window.removeEventListener("hashchange", queueUpdate);
      window.removeEventListener("popstate", queueUpdate);
      document.removeEventListener("scroll", queueUpdate, true);
      resizeObserver?.disconnect();
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    };
  }, [updateReadingState]);

  useEffect(() => {
    const targetId = decodeHash(window.location.hash);
    if (!targetId || !normalizedOutline.some((item) => item.id === targetId)) return undefined;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView();
      setActiveId(targetId);
      window.requestAnimationFrame(updateReadingState);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [normalizedOutline, updateReadingState]);

  return (
    <>
      <div
        className="reading-progress"
        role="progressbar"
        aria-label="文章阅读进度"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={Math.round(progress)}
      >
        <span style={{ transform: `scaleX(${progress / 100})` }} />
      </div>
      <div className={`article-reading-layout ${showToc ? "has-toc" : ""}`}>
        {showToc ? (
          <aside className={`article-toc ${mobileOpen ? "is-open" : ""}`} aria-label="文章目录">
            <button
              type="button"
              className="article-toc-toggle"
              aria-expanded={mobileOpen}
              aria-controls="article-toc-list"
              onClick={() => setMobileOpen((value) => !value)}
            >
              <span>文章目录</span>
              <span aria-hidden="true">{mobileOpen ? "收起" : `${normalizedOutline.length} 节`}</span>
            </button>
            <nav id="article-toc-list" className="article-toc-list" aria-label="正文目录">
              {normalizedOutline.map((item) => (
                <a
                  key={item.id}
                  href={`#${encodeURIComponent(item.id)}`}
                  className={`toc-level-${item.level}`}
                  aria-current={activeId === item.id ? "location" : undefined}
                  onClick={() => {
                    setActiveId(item.id);
                    setMobileOpen(false);
                    window.requestAnimationFrame(updateReadingState);
                  }}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </aside>
        ) : null}
        <div ref={contentRef} className="article-reading-column">{children}</div>
      </div>
    </>
  );
}
