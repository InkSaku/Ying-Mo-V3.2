import { useEffect, useId, useMemo, useRef, useState } from "react";
import { calculateReadingProgress, groupArticleOutline, hasArticleToc, normalizeArticleOutline } from "../lib/articleReading";
import ArchiveCatDrawing from "./ArchiveCatDrawing";
import { useTheme } from "../contexts/ThemeContext";
import { useReadingPanels } from "../hooks/useReadingPanels";
import { FavoriteButton, FavoriteLink } from "./FavoriteControl";
import "../styles/archive-cat.css";
import { MobileSheet } from "./MobileSheet";
import { useNarrowScreen } from "../hooks/useNarrowScreen";
import { CODE_FONTS, readCodeFont, saveCodeFont } from "../lib/codeFont";

function ReadingSettings({ fontSize, onChangeFontSize, onSetFontSize, onResetFontSize, codeFont, onChangeCodeFont }) {
  const menuRef = useRef(null);
  const narrow = useNarrowScreen();
  const [sheetOpen, setSheetOpen] = useState(false);
  const inputId = useId();
  const hintId = useId();
  const codeFontName = useId();
  const [fontDraft, setFontDraft] = useState(null);
  const { resolved, setMode } = useTheme();

  const commitFontSize = (value) => {
    if (!value.trim()) onResetFontSize();
    else if (Number.isFinite(Number(value))) onSetFontSize(Number(value));
    setFontDraft(null);
  };

  useEffect(() => {
    const closeOutside = (event) => {
      const menu = menuRef.current;
      if (menu?.open && !menu.contains(event.target)) menu.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  const controls = (
      <div className="article-reading-settings-panel">
        <div className="article-reading-font-size">
          <label htmlFor={inputId}>字号（px）</label>
          <div className="article-reading-font-size-controls">
            <input id={inputId} type="number" inputMode="numeric" min="16" max="24" step="1" placeholder="默认"
              aria-label="阅读字号" aria-describedby={hintId} value={fontDraft ?? (fontSize === null ? "" : String(fontSize))}
              onChange={(event) => setFontDraft(event.target.value)}
              onBlur={(event) => commitFontSize(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }} />
            <button type="button" aria-label="减小阅读字号" disabled={fontSize === 16} onClick={() => { setFontDraft(null); onChangeFontSize(-1); }}>A−</button>
            <button type="button" aria-label="增大阅读字号" disabled={fontSize === 24} onClick={() => { setFontDraft(null); onChangeFontSize(1); }}>A＋</button>
          </div>
          <p id={hintId}>16–24px，留空用默认</p>
        </div>
        <button type="button" onClick={() => { setFontDraft(null); onResetFontSize(); }}>恢复默认字号</button>
        <fieldset className="article-reading-code-font">
          <legend>代码字体</legend>
          <div className="article-reading-code-font-options">
            {CODE_FONTS.map((font) => (
              <label key={font.id}>
                <input type="radio" name={codeFontName} value={font.id} checked={codeFont === font.id} onChange={() => onChangeCodeFont(font.id)} />
                <span style={{ fontFamily: `var(--code-font-${font.id})` }}>{font.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <button type="button" onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          setMode(resolved === "dark" ? "light" : "dark", { origin: { x: box.x + box.width / 2, y: box.y + box.height / 2 } });
        }}>{resolved === "dark" ? "换成浅色纸" : "换成深色纸"}</button>
      </div>
  );
  if (narrow) return <>
    <button className="text-button mobile-sheet-trigger" type="button" aria-haspopup="dialog" aria-expanded={sheetOpen} onClick={() => setSheetOpen(true)}>Aa 阅读设置</button>
    <MobileSheet open={sheetOpen} title="阅读设置" onClose={() => { if (fontDraft !== null) commitFontSize(fontDraft); setSheetOpen(false); }}>{controls}</MobileSheet>
  </>;

  return (
    <details ref={menuRef} className="article-reading-settings"
      onBlur={(event) => {
        // Safari blurs the summary without focusing a tapped button; let its click finish.
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.currentTarget.open = false;
        event.currentTarget.querySelector("summary")?.focus();
      }}>
      <summary><span aria-hidden="true">Aa</span>阅读设置</summary>
      {controls}
    </details>
  );
}

export function ArticleReadingLayout({ outline, children, opening, navigation, favorite }) {
  const contentRef = useRef(null);
  const columnRef = useRef(null);
  const normalizedOutline = useMemo(() => normalizeArticleOutline(outline), [outline]);
  const showToc = hasArticleToc(normalizedOutline);
  const outlineGroups = useMemo(() => groupArticleOutline(normalizedOutline), [normalizedOutline]);
  const hasSubheadings = outlineGroups.some((group) => group.children.length);
  const [subheadingsOpen, setSubheadingsOpen] = useState(false);
  const [fontSize, setFontSize] = useState(() => {
    try {
      const value = Number(localStorage.getItem("yingmo-reading-font-size"));
      return Number.isInteger(value) && value >= 16 && value <= 24 ? value : null;
    } catch { return null; }
  });
  const [codeFont, setCodeFont] = useState(readCodeFont);
  const changeCodeFont = (id) => {
    saveCodeFont(id);
    setCodeFont(id);
  };
  const panels = useReadingPanels(showToc);
  const [activeId, setActiveId] = useState(normalizedOutline[0]?.id || "");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [catRunning, setCatRunning] = useState(false);
  const [catDirection, setCatDirection] = useState("right");
  const previousProgressRef = useRef(0);

  useEffect(() => {
    setActiveId(normalizedOutline[0]?.id || "");
    setMobileOpen(false);
    setSubheadingsOpen(false);
  }, [normalizedOutline]);

  useEffect(() => {
    try {
      if (fontSize === null) localStorage.removeItem("yingmo-reading-font-size");
      else localStorage.setItem("yingmo-reading-font-size", String(fontSize));
    } catch { /* Font controls work without storage. */ }
  }, [fontSize]);

  const applyFontSize = (value) => {
    setFontSize(Math.min(24, Math.max(16, Math.round(value))));
  };

  const changeFontSize = (delta) => {
    const prose = contentRef.current?.querySelector(".prose");
    const current = fontSize ?? (prose ? Number.parseFloat(getComputedStyle(prose).fontSize) : 19);
    applyFontSize(current + delta);
  };

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
    let frame = 0;
    let catIdleTimer = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateProgress = () => {
      frame = 0;
      const content = contentRef.current;
      if (!content) return;
      const bounds = content.getBoundingClientRect();
      const nextProgress = calculateReadingProgress({
        scrollTop: window.scrollY,
        contentTop: bounds.top + window.scrollY,
        contentHeight: bounds.height,
        viewportHeight: window.innerHeight,
      });
      if (nextProgress > previousProgressRef.current + .1) setCatDirection("right");
      if (nextProgress < previousProgressRef.current - .1) setCatDirection("left");
      previousProgressRef.current = nextProgress;
      setProgress(Math.round(nextProgress));
    };
    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateProgress);
    };
    const handleScroll = () => {
      requestUpdate();
      if (reducedMotion.matches) return;
      setCatRunning(true);
      window.clearTimeout(catIdleTimer);
      catIdleTimer = window.setTimeout(() => setCatRunning(false), 180);
    };
    requestUpdate();
    const contentObserver = new ResizeObserver(requestUpdate);
    if (contentRef.current) contentObserver.observe(contentRef.current);
    if (columnRef.current) contentObserver.observe(columnRef.current);
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", requestUpdate);
    return () => {
      contentObserver.disconnect();
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", requestUpdate);
      window.clearTimeout(catIdleTimer);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [normalizedOutline]);

  return (
    <>
      <div className="article-reading-navigation">
        {navigation}
        <div className="article-reading-compact-tools">
          <ReadingSettings fontSize={fontSize} onChangeFontSize={changeFontSize} onSetFontSize={applyFontSize} onResetFontSize={() => setFontSize(null)} codeFont={codeFont} onChangeCodeFont={changeCodeFont} />
        </div>
      </div>
      <div ref={panels.layoutRef} style={{ ...panels.style, ...(fontSize !== null ? { "--reading-font-size": `${fontSize}px` } : {}) }} className={`article-reading-layout ${showToc ? "has-toc" : ""} ${panels.resizable ? "is-resizable" : ""} ${panels.dragging ? "is-resizing" : ""}`}>
        {showToc ? (
          <aside className={`article-toc ${mobileOpen ? "is-open" : ""}`} aria-label="文章目录">
            <p className="article-toc-label">文章目录</p>
            <p className="article-toc-hint">主要章节</p>
            <button
              type="button"
              className="article-toc-toggle"
              aria-expanded={mobileOpen}
              aria-controls="article-toc-list"
              onClick={() => setMobileOpen((value) => !value)}
            >
              <span>文章目录</span>
              <span aria-hidden="true">{mobileOpen ? "收起" : `${outlineGroups.length} 节`}</span>
            </button>
            <nav id="article-toc-list" className="article-toc-list" aria-label="正文目录">
              {outlineGroups.map((group) => <div className="article-toc-group" key={group.id}>
                <a
                  href={`#${encodeURIComponent(group.id)}`}
                  aria-current={activeId === group.id || (!subheadingsOpen && group.children.some((item) => item.id === activeId)) ? "location" : undefined}
                  onClick={() => {
                    setActiveId(group.id);
                    setMobileOpen(false);
                  }}
                >
                  {group.label}
                </a>
                {group.children.length ? <div className="article-toc-children" hidden={!subheadingsOpen}>
                  {group.children.map((item) => <a key={item.id} href={`#${encodeURIComponent(item.id)}`} className={`toc-level-${item.level}`} aria-current={subheadingsOpen && activeId === item.id ? "location" : undefined} onClick={() => { setActiveId(item.id); setMobileOpen(false); }}>{item.label}</a>)}
                </div> : null}
              </div>)}
            </nav>
            {hasSubheadings ? <button className="article-toc-subheadings-toggle" type="button" aria-expanded={subheadingsOpen} aria-controls="article-toc-list" onClick={() => setSubheadingsOpen((value) => !value)}>{subheadingsOpen ? "收起子标题" : "展开子标题"}<span aria-hidden="true">⌄</span></button> : null}
          </aside>
        ) : null}
        {showToc ? <div className="article-panel-divider article-panel-divider-left" {...panels.separatorProps("toc")}><span aria-hidden="true" /></div> : null}
        <div ref={columnRef} className="article-reading-column">
          {opening}
          <div ref={contentRef} className="article-reading-content">{children}</div>
        </div>
        <div className="article-panel-divider article-panel-divider-right" {...panels.separatorProps("rail")}><span aria-hidden="true" /></div>
        <aside className="article-reading-rail" aria-label="阅读进度">
          <p className="article-reading-rail-eyebrow">阅读工具</p>
          <div className="article-reading-rail-value">
            <strong>{progress}%</strong>
            <span>已读</span>
          </div>
          <ReadingSettings fontSize={fontSize} onChangeFontSize={changeFontSize} onSetFontSize={applyFontSize} onResetFontSize={() => setFontSize(null)} codeFont={codeFont} onChangeCodeFont={changeCodeFont} />
          <FavoriteButton key={favorite?.postId ?? "pending"} rail favorited={favorite?.favorited} ready={favorite?.ready} busy={favorite?.busy} celebration={favorite?.celebration} onToggle={favorite?.toggleFavorite} />
          {favorite?.ready && favorite.favorited ? <FavoriteLink rail /> : null}
          {favorite?.error ? <p className="article-reading-tool-error" role="alert">{favorite.error}</p> : null}
          <button type="button" onClick={() => window.scrollTo({
            top: 0,
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
          })}>
            <span aria-hidden="true">↑</span> 回到篇首
          </button>
          <div className="article-reading-companion" aria-hidden="true">
            <p><span></span><span>{progress >= 100 ? "已读完" : "阅读中"}</span></p>
            <div className="article-reading-cat-track">
              <div
                className="article-archive-cat-runner article-reading-cat-runner"
                data-running={catRunning}
                data-direction={catDirection}
                style={{ left: `${progress}%`, transform: `translateX(-${progress}%)` }}
              >
                <ArchiveCatDrawing />
              </div>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
