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

function ExploreSectionHeading({ title, description, href, linkLabel }) {
  return (
    <header className="explore-section-heading">
      <div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>
      {href ? <Link to={href}>{linkLabel}<span aria-hidden="true"> →</span></Link> : null}
    </header>
  );
}

function ExploreOpening({ article, note }) {
  const media = article?.cover_media || article?.display_media;
  return (
    <div className={`explore-opening${article && note ? "" : " is-single"}`}>
      {article ? (
        <article className={`explore-opening-story${media ? " has-media" : " without-media"}`}>
          {media ? <Link className="explore-opening-visual" to={postHref(article)} aria-label={`从这里开始：${article.title || "未命名文章"}`}>
            <ProtectedImage media={media} alt={media.alt_text ?? ""} fallback={<span className="explore-opening-media-error" role="status">影像暂时无法读取</span>} />
          </Link> : null}
          <div className="explore-opening-caption">
            <span>本次开篇 · {article.author?.nickname || "朋友"} · {formatDate(article.published_at)}</span>
            <h2><Link to={postHref(article)}>{article.title || "未命名文章"}</Link></h2>
            <p>{excerpt(article) || ""}</p>
            <Link className="explore-read-link" to={postHref(article)}>阅读全文 <span aria-hidden="true">→</span></Link>
          </div>
        </article>
      ) : null}
      {note ? (
        <aside className="explore-opening-note">
          <span>随记</span>
          <p><Link to={postHref(note)}>{excerpt(note) || "一则影像随记"}</Link></p>
          <small>{note.author?.nickname || "朋友"} · {formatDate(note.semantic_time)}</small>
        </aside>
      ) : null}
    </div>
  );
}

function ExploreLoader() {
  return (
    <main className="page-shell explore-page explore-page-loading" aria-busy="true" aria-live="polite">
      <span className="sr-only">正在加载漫游内容…</span>
      <div className="explore-loader-frontispiece">
        <div className="explore-loader-copy"><div className="skeleton-line skeleton-line-short" /><div className="skeleton-line skeleton-line-title" /><div className="skeleton-line" /></div>
        <div className="skeleton-block" />
      </div>
      <div className="explore-loader-grid"><div className="skeleton-block" /><div className="skeleton-stack"><div className="skeleton-block" /><div className="skeleton-block" /></div></div>
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
  const articleTrail = data.random_articles?.slice(1) || [];
  const noteTrail = data.random_notes?.slice(1) || [];
  const tags = data.roaming_tags || [];
  const collections = data.featured_collections || [];
  const memories = data.on_this_day?.items || [];
  const members = data.recent_members || [];
  const hasExploreContent = Boolean(openingArticle || openingNote || tags.length || collections.length || memories.length || members.length);

  return (
    <main className="page-shell explore-page" aria-busy={state.loading || undefined}>
      <header className="explore-frontispiece">
        <div className="explore-frontispiece-copy">
          <div className="explore-intro">
            <p className="explore-kicker"></p>
            <h1>漫游</h1>
            <p className="explore-manifesto"></p>
            <p className="explore-introduction">随机看看朋友的记录。</p>
          </div>
          <div className="explore-walk-margin"><ExploreSketch /></div>
          <button className="explore-shuffle" type="button" disabled={state.loading} onClick={shuffle}>
            <span>{state.loading ? "正在加载…" : "换一批内容"}</span><span aria-hidden="true">↻</span>
          </button>
        </div>
        {openingArticle || openingNote ? <ExploreOpening article={openingArticle} note={openingNote} /> : null}
      </header>

      {!hasExploreContent ? (
        <section className="explore-all-empty" aria-labelledby="explore-empty-title">
          <h2 id="explore-empty-title">暂时没有可浏览的内容</h2>
          <p>可以返回首页，或写下自己的记录。</p>
          <nav aria-label="空漫游页可用入口"><Link to="/home">返回首页</Link><Link to="/write">先写一篇</Link></nav>
        </section>
      ) : (
        <>
          {articleTrail.length ? <section className="explore-section explore-article-section">
            <ExploreSectionHeading title="更多文章" description="" href="/articles" linkLabel="全部文章" />
            <div className="explore-article-ledger">{articleTrail.map((post) => <PostCard key={post.id} post={post} compact />)}</div>
          </section> : null}

          {noteTrail.length ? <section className="explore-section explore-note-section">
            <ExploreSectionHeading title="随记" description="" href="/notes" linkLabel="全部随记" />
            <div className="explore-note-rail">{noteTrail.map((post) => <PostCard key={post.id} post={post} compact />)}</div>
          </section> : null}

          {tags.length || collections.length ? <div className={`explore-section explore-index-layout${tags.length && collections.length ? "" : " is-single"}`}>
            {tags.length ? <section className="explore-index-section" aria-labelledby="explore-tags-title">
              <header className="explore-section-heading"><div><h2 id="explore-tags-title">标签</h2><p></p></div><Link to="/tags">全部标签 <span aria-hidden="true">→</span></Link></header>
              <nav className="explore-tag-index" aria-label="漫游标签">{tags.map((tag) => <Link key={tag.id} to={`/tags/${tag.slug}`}><strong>#{tag.name}</strong><span>{tag.visible_post_count} 篇</span></Link>)}</nav>
            </section> : null}
            {collections.length ? <section className="explore-index-section" aria-labelledby="explore-collections-title">
              <header className="explore-section-heading"><div><h2 id="explore-collections-title">合集</h2><p></p></div><Link to="/collections">全部合集 <span aria-hidden="true">→</span></Link></header>
              <div className="explore-collection-grid">{collections.map((collection) => <CollectionCard key={collection.id} collection={collection} />)}</div>
            </section> : null}
          </div> : null}

          {memories.length ? <section className="explore-section explore-memory-section">
            <header className="explore-section-heading"><div><p className="explore-memory-date">{memoryDayLabel(data.on_this_day)}</p><h2>往年今日</h2><p></p></div><Link to="/on-this-day">查看全部 <span aria-hidden="true">→</span></Link></header>
            <div className="explore-memory-grid">{memories.map((post) => <MemoryCard key={post.id} post={post} />)}</div>
          </section> : null}

          {members.length ? <section className="explore-section explore-member-section">
            <ExploreSectionHeading title="新朋友" description="最近加入映墨的成员。" />
            <div className="explore-member-grid">{members.map((member) => <MemberCard key={member.id} member={member} />)}</div>
          </section> : null}
        </>
      )}
    </main>
  );
}
