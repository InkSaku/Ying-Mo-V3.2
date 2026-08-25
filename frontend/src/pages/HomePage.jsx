import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { HomeFeed } from "../components/HomeFeed";
import { QuickNoteComposer } from "../components/QuickNoteComposer";
import { useAuth } from "../contexts/AuthContext";
import { usePageMeta } from "../hooks/usePageMeta";
import { HOME_FEED_SAVE_EVENT, normalizeHomeFeedType, readHomeFeedCache } from "../lib/homeFeed";

const feedFilters = [["all", "全部"], ["note", "随记"], ["article", "文章"]];

export function HomePage() {
  usePageMeta("首页");
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const type = normalizeHomeFeedType(params.get("type"));
  const [publishedPost, setPublishedPost] = useState(null);

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
        if (toolbar) window.scrollTo(0, Math.max(0, toolbar.offsetTop - 72));
      });
    }
  };

  return (
    <main className="page-shell home-page home-feed-page">
      <header className="home-feed-intro">
        <div className="home-feed-intro-copy">
          <p className="hero-kicker">你的映墨</p>
          <h1>继续写，也继续往下读。</h1>
          <p>朋友的随记与文章，按它们真正发生的时间汇在一起。</p>
        </div>
        <nav aria-label="首页延伸入口">
          <Link to="/on-this-day"><span>01</span>往年今日</Link>
          <Link to="/explore"><span>02</span>漫游内容</Link>
          <Link to="/collections"><span>03</span>我的合集</Link>
        </nav>
      </header>

      <div className="home-compose-layout">
        <aside className="home-compose-caption" aria-hidden="true">
          <span>NOW</span>
          <p>给此刻留一小块空白。</p>
        </aside>
        <QuickNoteComposer autoFocus={params.get("compose") === "note"} onPublished={setPublishedPost} />
      </div>

      <div className="home-feed-toolbar">
        <div className="home-feed-toolbar-heading"><p>JOURNAL</p><h2 id="home-feed-title">时间流</h2><span>内容本身就是首页。</span></div>
        <div className="home-feed-filters" aria-label="筛选时间流">
          {feedFilters.map(([value, label]) => (
            <button key={value} type="button" className={type === value ? "is-active" : ""} aria-pressed={type === value} onClick={() => selectType(value)}>{label}</button>
          ))}
        </div>
      </div>

      <HomeFeed key={`${user.id}:${type}`} userId={user.id} type={type} newPost={publishedPost} />
    </main>
  );
}
