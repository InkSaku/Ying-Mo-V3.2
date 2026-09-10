import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { HomeFeed } from "../components/HomeFeed";
import { QuickNoteComposer } from "../components/QuickNoteComposer";
import { HomeClosing } from "../components/HomeClosing";
import { HomeInkLandscape, HomeWritingSketch } from "../components/HomeSketches";
import { useAuth } from "../contexts/AuthContext";
import { usePageMeta } from "../hooks/usePageMeta";
import { HOME_FEED_SAVE_EVENT, normalizeHomeFeedType, readHomeFeedCache } from "../lib/homeFeed";
import "../styles/home.css";
import "../styles/home-editorial.css";

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
    <main ref={pageRef} className="page-shell home-page home-feed-page home-journal home-editorial">
      <header className="home-edition-heading">
        <div className="home-edition-copy"><p>映墨 · 日常来信</p><h1>日子缓缓，<br />读到彼此。</h1><p className="home-edition-note">一些近况，一点想念。这里收着朋友们的日常。</p></div>
        <HomeInkLandscape />
        <p className="home-edition-hand" aria-hidden="true">Good things<br /><span>take time.</span></p>
      </header>
      <div className="home-editorial-columns">
      <aside id="home-writing" className="home-writing-margin" aria-label="书写与回望">
        <HomeWritingSketch />
        <div className="home-compose-layout">
          <QuickNoteComposer appearance="paper" autoFocus={params.get("compose") === "note"} onPublished={setPublishedPost} onCollectionsLoaded={setCollections} />
        </div>
        <nav className="home-margin-nav" aria-label="首页延伸入口">
          <Link to="/on-this-day"><span>往年今日</span><small>翻回曾经的这一页</small><b aria-hidden="true">↗</b></Link>
          <Link to="/collections"><span>共同的册页</span><small>把片刻，慢慢汇成册</small><b aria-hidden="true">↗</b></Link>
          <Link to="/me/posts"><span>我的文稿</span><small>拾起上次未写完的那一页</small><b aria-hidden="true">↗</b></Link>
        </nav>
      </aside>
      <section className="home-reading-column" aria-label="朋友的记录">
      <div className="home-feed-toolbar">
        <div className="home-feed-toolbar-heading"><h2 id="home-feed-title">近来的记录</h2></div>
        <div className="home-feed-filters" aria-label="筛选时间流">
          {feedFilters.map(([value, label]) => (
            <button key={value} type="button" className={type === value ? "is-active" : ""} aria-pressed={type === value} onClick={() => selectType(value)}>{label}</button>
          ))}
        </div>
      </div>

      <HomeFeed key={`${user.id}:${type}`} userId={user.id} type={type} newPost={publishedPost} onSnapshot={receiveSnapshot} />
      </section>
      </div>
      <HomeClosing memory={homeSnapshot?.memoryInterlude} collections={collections || []} collectionsReady={collections !== null} />
    </main>
  );
}
