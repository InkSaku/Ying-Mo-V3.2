import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { HomeFeed } from "../components/HomeFeed";
import { QuickNoteComposer } from "../components/QuickNoteComposer";
import { HomeClosing } from "../components/HomeClosing";
import { HomeOpeningFeature } from "../components/HomeOpeningFeature";
import { useAuth } from "../contexts/AuthContext";
import { usePageMeta } from "../hooks/usePageMeta";
import { homeFeaturePost } from "../lib/homeComposition";
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
  const feature = homeFeaturePost(homeSnapshot?.items);
  const editionDate = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(new Date());
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
      <section className="home-edition-heading" aria-label="映墨日常来信">
        <div className="home-edition-copy">
          <p className="home-edition-eyebrow">映墨 / {editionDate} · 今日来信</p>
          <h1>生活正在<br /><span>被我们写下。</span></h1>
          <p className="home-edition-note">朋友们的近况、路上的风景，和那些想留给未来的片刻。今天，从这一页读起。</p>
          <div className="home-edition-cue" aria-hidden="true">
            <svg viewBox="0 0 40 40" fill="none"><path d="m20 3 2.9 12.1L35 18l-11.5 4.3L21 36l-5.2-11.6L5 21l11.5-4.1L20 3Z" /><path d="M3 31c5 0 7 2 9 6" /></svg>
            <span>一封信，从某个人真实的今天开始。</span>
          </div>
        </div>
        <HomeOpeningFeature post={feature} loading={!homeSnapshot} />
      </section>
      <div id="home-writing" className="home-compose-layout">
        <QuickNoteComposer appearance="homePrompt" autoFocus={params.get("compose") === "note"} onPublished={(post) => {
          setPublishedPost(post);
          setHomeSnapshot((current) => current ? { ...current, items: [post, ...(current.items || [])] } : { items: [post], memoryInterlude: null });
        }} onCollectionsLoaded={setCollections} />
      </div>
      <div className="home-editorial-columns">
        <section className="home-reading-column" aria-label="朋友的记录">
          <div className="home-feed-toolbar">
            <div className="home-feed-toolbar-heading"><h2 id="home-feed-title">朋友们刚刚留下</h2></div>
            <div className="home-feed-filters" aria-label="筛选时间流">
              {feedFilters.map(([value, label]) => (
                <button key={value} type="button" className={type === value ? "is-active" : ""} aria-pressed={type === value} onClick={() => selectType(value)}>{label}</button>
              ))}
            </div>
          </div>
          <HomeFeed key={`${user.id}:${type}`} userId={user.id} type={type} newPost={publishedPost} onSnapshot={receiveSnapshot} />
        </section>
        <aside className="home-side-rail" aria-label="回望与共同记录">
          <HomeClosing memory={homeSnapshot?.memoryInterlude} collections={collections || []} collectionsReady={collections !== null} />
          <Link className="home-side-drafts" to="/me/posts">接着写我的文稿 ↗</Link>
        </aside>
      </div>
    </main>
  );
}
