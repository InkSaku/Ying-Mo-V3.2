import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { HomeFeed } from "../components/HomeFeed";
import { QuickNoteComposer } from "../components/QuickNoteComposer";
import { HomeCollage } from "../components/HomeCollage";
import { HomeClosing } from "../components/HomeClosing";
import { useAuth } from "../contexts/AuthContext";
import { usePageMeta } from "../hooks/usePageMeta";
import { HOME_FEED_SAVE_EVENT, normalizeHomeFeedType, readHomeFeedCache } from "../lib/homeFeed";
import "../styles/home.css";

const feedFilters = [["all", "全部"], ["note", "随记"], ["article", "文章"]];

export function HomePage() {
  usePageMeta("首页");
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const type = normalizeHomeFeedType(params.get("type"));
  const [publishedPost, setPublishedPost] = useState(null);
  const [homeSnapshot, setHomeSnapshot] = useState(() => readHomeFeedCache(user.id, type));
  const [collections, setCollections] = useState(null);
  const pageRef = useRef(null);
  // Keep the opening composition stable while readers filter or load more.
  const receiveSnapshot = useCallback((snapshot) => {
    setHomeSnapshot((current) => current?.items?.length ? current : snapshot);
  }, []);

  useLayoutEffect(() => {
    const header = document.querySelector(".app-header");
    if (!header) return undefined;
    const measure = () => pageRef.current?.style.setProperty("--home-header-height", `${header.getBoundingClientRect().height}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  const selectType = (nextType) => {
    window.dispatchEvent(new Event(HOME_FEED_SAVE_EVENT));
    const hasSnapshot = Boolean(readHomeFeedCache(user.id, nextType));
    const next = new URLSearchParams(params);
    if (nextType === "all") next.delete("type");
    else next.set("type", nextType);
    setParams(next, { replace: true, preventScrollReset: true });
    if (!hasSnapshot) {
      window.requestAnimationFrame(() => {
        const toolbar = document.querySelector(".home-feed-toolbar");
        const header = document.querySelector(".app-header");
        if (toolbar) window.scrollTo(0, Math.max(0, toolbar.getBoundingClientRect().top + window.scrollY - (header?.getBoundingClientRect().height || 0)));
      });
    }
  };

  return (
    <main ref={pageRef} className="page-shell home-page home-feed-page home-journal">
      <header className="home-frontispiece">
        <p className="home-welcome">又见面了，今天想留下一点什么？</p>
        <div className="home-frontispiece-copy">
          <h1>映墨</h1>
          <p className="home-manifesto">写下此刻，<br />读到彼此。</p>
          <p className="home-introduction">文章、随记与共同经历，<br />在这里，慢慢汇成日常。</p>
          <nav aria-label="首页延伸入口">
            <Link to="/on-this-day">往年今日 <span aria-hidden="true">↗</span></Link>
            <Link to="/explore">漫游内容 <span aria-hidden="true">↗</span></Link>
            <Link to="/collections">我的合集 <span aria-hidden="true">↗</span></Link>
          </nav>
        </div>
        <HomeCollage posts={homeSnapshot?.items} />
        <div className="home-compose-layout">
          <QuickNoteComposer appearance="paper" autoFocus={params.get("compose") === "note"} onPublished={setPublishedPost} onCollectionsLoaded={setCollections} />
        </div>
      </header>

      <div className="home-feed-toolbar">
        <div className="home-feed-toolbar-heading"><h2 id="home-feed-title">时间流</h2><span>日常，陆续发生。</span></div>
        <div className="home-feed-filters" aria-label="筛选时间流">
          {feedFilters.map(([value, label]) => (
            <button key={value} type="button" className={type === value ? "is-active" : ""} aria-pressed={type === value} onClick={() => selectType(value)}>{label}</button>
          ))}
        </div>
      </div>

      <HomeFeed key={`${user.id}:${type}`} userId={user.id} type={type} newPost={publishedPost} onSnapshot={receiveSnapshot} />
      <HomeClosing memory={homeSnapshot?.memoryInterlude} collections={collections || []} collectionsReady={collections !== null} />
    </main>
  );
}
