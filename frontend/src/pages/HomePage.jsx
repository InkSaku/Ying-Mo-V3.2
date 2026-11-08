import { HomeFriendshipArt } from "../components/HomeFriendshipArt";
import { HomeMarginObjects } from "../components/HomeMarginObjects";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { HomeFeed } from "../components/HomeFeed";
import { QuickNoteComposer } from "../components/QuickNoteComposer";
import { HomeClosing } from "../components/HomeClosing";
import { HomeOpeningFeature } from "../components/HomeOpeningFeature";
import { HomeSparkEntry } from "../components/HomeSparkEntry";
import { WelcomeLetter } from "../components/WelcomeLetter";
import { useNewMemberWelcome } from "../hooks/useNewMemberWelcome";
import { useAuth } from "../contexts/AuthContext";
import { usePageMeta } from "../hooks/usePageMeta";
import { homeFeaturePost } from "../lib/homeComposition";
import { postHref } from "../lib/format";
import { HOME_FEED_PAGE_SIZE, HOME_FEED_SAVE_EVENT, normalizeHomeFeedType, readHomeFeedCache } from "../lib/homeFeed";
import "../styles/home.css";
import "../styles/home-editorial.css";
import "../styles/home-spark-entry.css";

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
  const pins = homeSnapshot?.pins?.items || [];
  const welcome = useNewMemberWelcome(user);
  const [composeRequest, setComposeRequest] = useState(0);
  // 新成员（还没写过内容）在开篇位置看到“第一封信”；此时不主推任何一条，朋友的记录全部留在下方时间流里。
  const feature = welcome.show ? null : pins[0] || homeFeaturePost(homeSnapshot?.items?.slice(0, HOME_FEED_PAGE_SIZE));
  // 新成员且还读不到任何记录时，“最近记录”只剩一个空标题，先隐藏；时间流组件照常挂载以便有内容时立即出现。
  const newcomerWithoutFeed = welcome.show && Boolean(homeSnapshot) && !homeSnapshot.items?.length && !pins.length;
  const editionDate = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(new Date());
  const receiveSnapshot = useCallback((snapshot) => {
    setHomeSnapshot(snapshot);
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
      <HomeSparkEntry />
      <section className="home-edition-heading" aria-label="朋友的近况">
        <div className="home-edition-copy">
          <p className="home-edition-eyebrow">映墨 · {editionDate} </p>
          <h1>朋友的<br /><span>近况</span></h1>
          <p className="home-edition-note">阅读朋友最近发布的文章与随记。</p>
          <div className="home-edition-cue" aria-hidden="true">
            <HomeFriendshipArt />
          </div>
          <HomeMarginObjects boundaryRef={pageRef} />
        </div>
        <div className="home-featured-opening">
          {welcome.show ? <WelcomeLetter
            user={user}
            counts={welcome.counts}
            onDismiss={welcome.dismiss}
            onStartWriting={() => setComposeRequest((value) => value + 1)}
          /> : <HomeOpeningFeature post={feature} pinned={Boolean(pins.length)} loading={!homeSnapshot} />}
          {pins.length > 1 ? <nav className="home-pinned-more" aria-label="更多置顶文章">
            {pins.slice(1).map((post) => <Link key={post.id} to={postHref(post)} state={{ fromHomeFeed: true }} onClick={() => window.dispatchEvent(new Event(HOME_FEED_SAVE_EVENT))}>
              <span>置顶</span><strong>{post.title}</strong><small>{post.author?.nickname || post.author?.username}</small>
            </Link>)}
          </nav> : null}
        </div>
      </section>
      <div id="home-writing" className="home-compose-layout">
        <QuickNoteComposer appearance="homePrompt" autoFocus={params.get("compose") === "note"} openRequest={composeRequest} onPublished={(post) => {
          welcome.markWritten();
          setPublishedPost(post);
          setHomeSnapshot((current) => current ? { ...current, items: [post, ...(current.items || [])] } : { items: [post], memoryInterlude: null });
        }} onCollectionsLoaded={setCollections} />
      </div>
      <div className="home-editorial-columns">
        <section className="home-reading-column" aria-label="朋友的记录">
          <div className="home-feed-toolbar" hidden={newcomerWithoutFeed || undefined}>
            <div className="home-feed-toolbar-heading"><h2 id="home-feed-title">最近记录</h2></div>
            <div className="home-feed-filters" aria-label="筛选时间流">
              {feedFilters.map(([value, label]) => (
                <button key={value} type="button" className={type === value ? "is-active" : ""} aria-pressed={type === value} onClick={() => selectType(value)}>{label}</button>
              ))}
            </div>
          </div>
          <HomeFeed key={`${user.id}:${type}`} userId={user.id} type={type} newPost={publishedPost} onSnapshot={receiveSnapshot} featuredId={pins.length ? null : feature?.id} hideEmptyState={welcome.show} />
        </section>
        {/* 新成员还没有往年记录和合集，侧栏只会是两段空状态，先不显示。 */}
        {welcome.show ? null : <aside className="home-side-rail" aria-label="回望与共同记录">
          <HomeClosing memory={homeSnapshot?.memoryInterlude} collections={collections || []} collectionsReady={collections !== null} />
          <span className="home-margin-pocket" data-home-margin-pocket="aside" aria-hidden="true" />
          <Link className="home-side-drafts" to="/me/posts">我的内容 ↗</Link>
        </aside>}
      </div>
    </main>
  );
}
