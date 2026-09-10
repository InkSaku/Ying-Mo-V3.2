import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { createExploreSeed, exploreApiPath, normalizeExploreSeed } from "../lib/explore";
import { excerpt, formatDate, postHref } from "../lib/format";
import { memoryDayLabel } from "../lib/onThisDay";
import { CollectionCard } from "../components/CollectionCard";
import { MemoryCard } from "../components/MemoryCard";
import { MemberCard } from "../components/MemberCard";
import { PostCard } from "../components/PostCard";
import { ProtectedImage } from "../components/ProtectedImage";
import { ErrorState } from "../components/States";
import { ExploreSketch } from "../components/ExploreSketch";
import "../styles/explore.css";

function ExploreEmpty({ children }) {
  return <div className="explore-section-empty"><p>{children}</p></div>;
}

function ExploreSectionHeading({ number, title, description, href, linkLabel }) {
  return (
    <header className="explore-section-heading">
      <span className="explore-section-number tabular" aria-hidden="true">{number}</span>
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {href ? <Link to={href}>{linkLabel}<span aria-hidden="true"> →</span></Link> : null}
    </header>
  );
}

function ExploreOpening({ article, note }) {
  const media = article?.cover_media || article?.display_media;
  return (
    <div className={`explore-opening${media ? " has-image" : " is-text-led"}`}>
      <p className="explore-opening-label">THIS WAY <span aria-hidden="true">↘</span></p>
      {article ? (
        <article className={`explore-opening-story${media ? " has-media" : " without-media"}`}>
          {media ? (
            <Link className="explore-opening-visual" to={postHref(article)} aria-label={`从这里开始：${article.title || "未命名文章"}`}>
              <ProtectedImage
                media={media}
                alt={media.alt_text ?? ""}
                fallback={<span className="explore-opening-media-error" role="status">影像暂时无法读取</span>}
              />
            </Link>
          ) : null}
          <div className="explore-opening-caption">
            <span>本次开篇 · {article.author?.nickname || "朋友"} · {formatDate(article.published_at)}</span>
            <h2><Link to={postHref(article)}>{article.title || "未命名文章"}</Link></h2>
            <p>{excerpt(article) || "翻开这篇文章，作为这次漫游的第一站。"}</p>
          </div>
        </article>
      ) : (
        <div className="explore-opening-story explore-opening-missing">
          <p>这次没有抽到文章。<br />不妨先沿着随记、标签或旧日片段走走。</p>
        </div>
      )}

      {note ? (
        <aside className="explore-opening-note">
          <span>途中拾到的一页</span>
          <p><Link to={postHref(note)}>{excerpt(note) || "一则影像随记"}</Link></p>
          <small>{note.author?.nickname || "朋友"} · {formatDate(note.semantic_time)}</small>
        </aside>
      ) : null}

      <svg className="explore-opening-doodle" viewBox="0 0 120 72" fill="none" aria-hidden="true">
        <path d="M8 14c28 2 51 12 69 30m0 0-4-17m4 17-18-1" />
        <path d="m102 8 3 8 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1 5-8Z" />
      </svg>
    </div>
  );
}

function ExploreLoader() {
  return (
    <main className="page-shell explore-page explore-page-loading" aria-busy="true" aria-live="polite">
      <span className="sr-only">正在寻找可以偶遇的内容</span>
      <div className="explore-loader-frontispiece">
        <div className="explore-loader-copy">
          <div className="skeleton-line skeleton-line-short" />
          <div className="skeleton-line skeleton-line-title" />
          <div className="skeleton-line" />
        </div>
        <div className="skeleton-block" />
      </div>
      <div className="explore-loader-grid">
        <div className="skeleton-block" />
        <div className="skeleton-stack"><div className="skeleton-block" /><div className="skeleton-block" /></div>
      </div>
    </main>
  );
}

export function ExplorePage() {
  usePageMeta("漫游");
  const [params, setParams] = useSearchParams();
  const seed = normalizeExploreSeed(params.get("seed"));
  const state = useAsyncData(() => api.get(exploreApiPath(seed)), [seed]);

  if (state.loading && !state.data) return <ExploreLoader />;
  if (state.error) return <main className="page-shell"><ErrorState error={state.error} onRetry={state.reload} /></main>;

  const data = state.data || {};
  const shuffle = () => setParams({ seed: createExploreSeed() });
  const openingArticle = data.random_articles?.[0];
  const openingNote = data.random_notes?.[0];
  const hasOpening = Boolean(openingArticle || openingNote);
  const articleTrail = openingArticle ? data.random_articles.slice(1) : [];
  const noteTrail = openingNote ? data.random_notes.slice(1) : data.random_notes || [];
  const hasExploreContent = Boolean(
    data.random_articles?.length
    || data.random_notes?.length
    || data.roaming_tags?.length
    || data.featured_collections?.length
    || data.on_this_day?.items?.length
    || data.recent_members?.length
  );
  return (
    <main className="page-shell explore-page" aria-busy={state.loading || undefined}>
      <header className={`explore-frontispiece${hasExploreContent ? "" : " is-empty"}${hasExploreContent && !hasOpening ? " no-opening" : ""}`}>
        <div className="explore-frontispiece-copy">
          <p className="explore-kicker">EXPLORE / 朋友内容漫游</p>
          <h1>漫游</h1>
          <p className="explore-manifesto">换一条路，<br />遇见彼此。</p>
          <p className="explore-introduction">从朋友们留下的文章、随记与共同记录里，随机翻开几页。</p>
          <div className="explore-walk-margin"><ExploreSketch /><p aria-hidden="true">A little detour.<br /><span>A new discovery.</span></p></div>
          <button className="explore-shuffle" type="button" disabled={state.loading} onClick={shuffle}>
            <span>{state.loading ? "正在换一条路" : "换一批内容"}</span>
            <span aria-hidden="true">↻</span>
          </button>
          <div className="explore-issue-metrics" aria-label="本次漫游概览">
            <span><strong>{data.random_articles?.length || 0}</strong> 文章</span>
            <span><strong>{data.random_notes?.length || 0}</strong> 随记</span>
            <span><strong>{data.roaming_tags?.length || 0}</strong> 标签</span>
          </div>
          <p className="explore-privacy-note">每次只改变路径；你看到的始终只是有权阅读的内容。</p>
        </div>
        {hasOpening ? <ExploreOpening article={openingArticle} note={openingNote} /> : null}
      </header>

      {!hasExploreContent ? (
        <section className="explore-all-empty" aria-labelledby="explore-empty-title">
          <p className="explore-section-number tabular" aria-hidden="true">00</p>
          <div>
            <h2 id="explore-empty-title">还没有可以偶遇的内容</h2>
            <p>等朋友们留下一些记录，再回来换一条路看看。</p>
            <nav aria-label="空漫游页可用入口">
              <Link to="/home">返回首页</Link>
              <Link to="/write">先写一篇</Link>
            </nav>
          </div>
        </section>
      ) : (
        <>
          <section className="explore-section explore-article-section">
            <ExploreSectionHeading number="01" title="继续翻一翻" description="从朋友们的正式文章中，再随意翻开几页。" href="/articles" linkLabel="全部文章" />
            {articleTrail.length
              ? <div className="explore-article-ledger">{articleTrail.map((post, index) => <PostCard key={post.id} post={post} compact variant="explore" index={index} />)}</div>
              : <ExploreEmpty>{openingArticle ? "这次抽到的文章已经放在开场了。" : "当前还没有可以漫游的文章。"}</ExploreEmpty>}
          </section>

          <section className="explore-section explore-note-section">
            <ExploreSectionHeading number="02" title="生活片段" description="偶遇朋友留下的随记、照片、地点与心情。" href="/notes" linkLabel="全部随记" />
            {noteTrail.length
              ? <div className="explore-note-rail">{noteTrail.map((post, index) => <PostCard key={post.id} post={post} compact variant="explore-note" index={index} />)}</div>
              : <ExploreEmpty>{openingNote ? "这次抽到的随记已经夹在开场里了。" : "当前还没有可以漫游的随记。"}</ExploreEmpty>}
          </section>

      <div className="explore-section explore-index-layout">
        <section className="explore-index-section" aria-labelledby="explore-tags-title">
          <header className="explore-index-header">
            <span className="explore-section-number tabular" aria-hidden="true">03</span>
            <div className="explore-index-title">
              <h2 id="explore-tags-title">沿着标签走</h2>
              <p>从这批记录的标签继续出发。</p>
            </div>
            <Link to="/tags">全部标签 <span aria-hidden="true">→</span></Link>
          </header>
          {data.roaming_tags?.length ? (
            <nav className="explore-tag-index" aria-label="漫游标签">
              {data.roaming_tags.map((tag, index) => (
                <Link key={tag.id} to={`/tags/${tag.slug}`}>
                  <i className="tabular" aria-hidden="true">{String(index + 1).padStart(2, "0")}</i>
                  <strong>#{tag.name}</strong>
                  <span>{tag.visible_post_count} 篇</span>
                </Link>
              ))}
            </nav>
          ) : <ExploreEmpty>当前还没有可见 Tag。</ExploreEmpty>}
        </section>

        <section className="explore-index-section explore-collection-index" aria-labelledby="explore-collections-title">
          <header className="explore-index-header">
            <span className="explore-section-number tabular" aria-hidden="true">04</span>
            <div className="explore-index-title">
              <h2 id="explore-collections-title">进入一册合集</h2>
              <p>走进你已经加入的一册共同记录。</p>
            </div>
            <Link to="/collections">全部合集 <span aria-hidden="true">→</span></Link>
          </header>
          {data.featured_collections?.length
            ? <div className="explore-collection-grid">{data.featured_collections.map((item, index) => <CollectionCard key={item.id} collection={item} variant="featured" index={index} />)}</div>
            : <ExploreEmpty>当前没有你可以进入的精选 Collection。</ExploreEmpty>}
        </section>
      </div>

      <section className="explore-section explore-memory-section">
        <header className="explore-memory-header">
          <span className="explore-section-number tabular" aria-hidden="true">05</span>
          <div>
            <p>{memoryDayLabel(data.on_this_day)}</p>
            <h2>往年今日</h2>
            <span>重新遇见旧日片段。</span>
          </div>
          <Link to="/on-this-day">查看全部 <span aria-hidden="true">→</span></Link>
        </header>
        <div className="explore-memory-content">
          {data.on_this_day?.items?.length
            ? <div className="explore-memory-grid">{data.on_this_day.items.map((post) => <MemoryCard key={post.id} post={post} />)}</div>
            : <ExploreEmpty>今天暂时没有你可见的旧日记录。</ExploreEmpty>}
        </div>
      </section>

      <section className="explore-section explore-member-section">
        <ExploreSectionHeading number="06" title="新朋友" description="在这里，认识最近开始记录生活的朋友。" />
        {data.recent_members?.length
          ? <div className="explore-member-grid">{data.recent_members.map((member) => <MemberCard key={member.id} member={member} />)}</div>
          : <ExploreEmpty>暂时还没有其他成员。</ExploreEmpty>}
      </section>
        </>
      )}
    </main>
  );
}
