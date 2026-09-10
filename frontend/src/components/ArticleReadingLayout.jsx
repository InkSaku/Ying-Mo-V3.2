import { useEffect, useMemo, useRef, useState } from "react";
import { hasArticleToc, normalizeArticleOutline } from "../lib/articleReading";
import { ArticleTocSketch } from "./ArticleSketches";

function decodeHash(value) {
  try {
    return decodeURIComponent(String(value || "").replace(/^#/, ""));
  } catch {
    return "";
  }
}

export function ArticleReadingLayout({ outline, children }) {
  const contentRef = useRef(null);
  const normalizedOutline = useMemo(() => normalizeArticleOutline(outline), [outline]);
  const showToc = hasArticleToc(normalizedOutline);
  const [activeId, setActiveId] = useState(normalizedOutline[0]?.id || "");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setActiveId(normalizedOutline[0]?.id || "");
    setMobileOpen(false);
  }, [normalizedOutline]);

  useEffect(() => {
    if (!showToc || typeof IntersectionObserver === "undefined") return undefined;
    const headings = normalizedOutline
      .map((item) => document.getElementById(item.id))
      .filter(Boolean);
    if (!headings.length) return undefined;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]?.target?.id) setActiveId(visible[0].target.id);
    }, { rootMargin: "-88px 0px -68% 0px", threshold: [0, 1] });
    headings.forEach((heading) => observer.observe(heading));
    return () => {
      observer.disconnect();
    };
  }, [normalizedOutline, showToc]);

  useEffect(() => {
    const targetId = decodeHash(window.location.hash);
    if (!targetId || !normalizedOutline.some((item) => item.id === targetId)) return undefined;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView();
      setActiveId(targetId);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [normalizedOutline]);

  return (
    <>
      <div className="reading-progress" aria-hidden="true"><span /></div>
      <div className={`article-reading-layout ${showToc ? "has-toc" : ""}`}>
        {showToc ? (
          <aside className={`article-toc ${mobileOpen ? "is-open" : ""}`} aria-label="文章目录">
            <p className="article-toc-eyebrow" aria-hidden="true">ON THIS PAGE</p>
            <p className="article-toc-label">文章目录</p>
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
              {normalizedOutline.map((item, index) => (
                <a
                  key={item.id}
                  href={`#${encodeURIComponent(item.id)}`}
                  className={`toc-level-${item.level}`}
                  aria-current={activeId === item.id ? "location" : undefined}
                  onClick={() => {
                    setActiveId(item.id);
                    setMobileOpen(false);
                  }}
                >
                  <span className="article-toc-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <span>{item.label}</span>
                </a>
              ))}
            </nav>
            <ArticleTocSketch />
          </aside>
        ) : null}
        <div ref={contentRef} className="article-reading-column">
          <header className="article-reading-start" aria-hidden="true">
            <span>正文</span>
            <span>READ FROM HERE</span>
          </header>
          {children}
        </div>
      </div>
    </>
  );
}
