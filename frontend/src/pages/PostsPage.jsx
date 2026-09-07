import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { PostFilters } from "../components/PostFilters";
import { PostCard } from "../components/PostCard";
import { ArticleIndexRow, ArticleLeadStory, ArticleMarginStory } from "../components/ArticlePublication";
import { EmptyState, ErrorState, PageLoader } from "../components/States";
import { Pagination } from "../components/Pagination";
import { clampPageToTotal } from "../lib/pagination";
import { hasActivePostFilters, postFilterSearchParams, postsApiPath, readPostFilters } from "../lib/postBrowsing";
import { formatDate } from "../lib/format";
import "../styles/articles.css";

const PAGE_SIZE = 12;

function notePeriod(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})/);
  if (!match) return { key: "undated", year: "日期", month: null };
  return { key: match[1], year: match[1], month: Number(match[2]) };
}

function groupNotesByYear(posts) {
  const groups = new Map();
  posts.forEach((post, index) => {
    const period = notePeriod(post.semantic_time);
    if (!groups.has(period.key)) groups.set(period.key, { key: period.key, year: period.year, months: new Set(), items: [] });
    const group = groups.get(period.key);
    if (period.month) group.months.add(period.month);
    group.items.push({ post, index });
  });
  return [...groups.values()].map(({ months, ...group }) => {
    const range = [...months].sort((a, b) => a - b);
    const month = range.length > 1 ? `${range[0]}—${range.at(-1)} 月` : range.length ? `${range[0]} 月` : "未定";
    return { ...group, month };
  });
}

function articleYear(post) {
  const match = String(post?.published_at || post?.updated_at || "").match(/^(\d{4})/);
  return match?.[1] || "日期";
}

function groupArticlesByYear(posts) {
  const groups = new Map();
  posts.forEach((post) => {
    const year = articleYear(post);
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year).push(post);
  });
  return [...groups.entries()].map(([year, items]) => ({ year, items }));
}

function BrowseHero({ isArticle, total, latestPost, sort = "newest" }) {
  if (isArticle) {
    const openingCopy = sort === "oldest" ? "从最早保存的一篇开始" : sort === "updated" ? "从最近整理的一篇开始" : "从最近写下的一篇开始";
    return (
      <header className="browse-hero browse-hero-article">
        <div className="browse-hero-copy">
          <p className="hero-kicker">ARTICLES / READING ARCHIVE</p>
          <h1>文章，<br />展开阅读。</h1>
          <p>长文、学习笔记与生活观察，依照阅读关系而不是组件尺寸，被装订成一册持续生长的私人刊物。</p>
        </div>
        <aside className="articles-hero-note" aria-label="文章目录概览">
          <strong>{openingCopy}</strong>
          <p>共 {total || 0} 篇可阅读文章{latestPost?.published_at ? <><br />本页首篇发布于 {formatDate(latestPost.published_at)}</> : null}</p>
          <nav aria-label="内容类型切换"><Link className="active" to="/articles">文章</Link><Link to="/notes">随记</Link></nav>
          <a href="#browse-content">进入目录 <span aria-hidden="true">↓</span></a>
          <i className="articles-hero-scribble" aria-hidden="true">TAKE YOUR TIME ↘</i>
        </aside>
      </header>
    );
  }

  return (
    <header className="browse-hero browse-hero-note">
      <div className="browse-hero-copy">
        <p className="hero-kicker">Field Notes</p>
        <h1>随记，<br />留住当下。</h1>
        <p>更轻的生活片段、地点、心情与即时记录，按真正发生的时间装订成册。</p>
      </div>
      <aside className="browse-hero-index" aria-label="内容目录概览">
        <span className="tabular">{total || 0}</span>
        <div><strong>则可阅读随记</strong><p>仅统计当前账号有权读取的内容。</p></div>
        <nav aria-label="内容类型切换"><Link to="/articles">文章</Link><Link className="active" to="/notes">随记</Link></nav>
        <a className="browse-hero-jump" href="#browse-content"><span>START READING</span>从本页首篇开始 <i aria-hidden="true">↓</i></a>
      </aside>
    </header>
  );
}

function ArticleMagazine({ posts, page, total, sort }) {
  const lead = posts[0];
  const secondary = posts.slice(1, 3);
  const indexPosts = posts.slice(3);
  const archiveGroups = groupArticlesByYear(indexPosts);
  const openingLabel = sort === "newest" ? "LATEST STORY" : sort === "oldest" ? "FROM THE ARCHIVE" : "RECENTLY UPDATED";
  return (
    <section className="browse-editorial-section" id="browse-content" aria-labelledby="article-magazine-heading">
      <header className="browse-section-heading"><div><p>READING SELECTION / PAGE {String(page).padStart(2, "0")}</p><h2 id="article-magazine-heading">从这里开始</h2></div><span>{total} 篇文章 · 先读一篇，再慢慢走进目录</span></header>
      <div className="article-magazine-grid">
        <div className="article-magazine-opening">
          <div className="article-magazine-opening-main">
            <p className="article-magazine-opening-label">{openingLabel} <span>本页首篇</span></p>
            <ArticleLeadStory post={lead} index={(page - 1) * PAGE_SIZE} />
          </div>
          {secondary.length ? <aside className="article-magazine-rail" aria-label="延伸阅读篇目">
            <header><span>READ NEXT</span><strong>接着阅读</strong><small>{secondary.length} 篇延伸阅读</small></header>
            {secondary.map((post, index) => <ArticleMarginStory key={post.id} post={post} index={(page - 1) * PAGE_SIZE + index + 1} />)}
          </aside> : null}
        </div>
        {archiveGroups.length ? <section className="article-magazine-index-section" aria-label="文章年份目录">
          <header><span>ARCHIVE</span><strong>文章档案</strong><small>依照发布时间继续浏览</small></header>
          <div className="article-year-groups">
            {archiveGroups.map((group) => <section className="article-year-group" key={group.year} aria-labelledby={`article-year-${group.year}`}>
              <header><strong className="tabular" id={`article-year-${group.year}`}>{group.year}</strong><span>{group.items.length} STORIES</span></header>
              <ol className="article-magazine-index-list">
                {group.items.map((post) => <ArticleIndexRow key={post.id} post={post} />)}
              </ol>
            </section>)}
          </div>
        </section> : null}
      </div>
    </section>
  );
}

function NoteJournal({ posts, page, total }) {
  return (
    <section className="browse-editorial-section" id="browse-content" aria-labelledby="note-journal-heading">
      <header className="browse-section-heading"><div><p>JOURNAL / {String(page).padStart(2, "0")}</p><h2 id="note-journal-heading">发生时间手账</h2></div><span>{total} 则随记 · 按当前条件编排</span></header>
      <div className="note-journal">
        {groupNotesByYear(posts).map((group) => (
          <section className="note-journal-period" key={group.key}>
            <header><p>YEAR BOOK</p><strong className="tabular">{group.year}</strong><span>{group.month}</span><small>{group.items.length} 则片段</small></header>
            <div className="note-journal-entries">
              {group.items.map(({ post, index }) => <PostCard key={post.id} post={post} compact index={(page - 1) * PAGE_SIZE + index} variant="journal" />)}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

export function PostsPage({ type }) {
  const isArticle = type === "article";
  usePageMeta(isArticle ? "文章" : "随记");
  const [params, setParams] = useSearchParams();
  const filters = readPostFilters(params, type);
  const { page } = filters;
  const canonicalParams = postFilterSearchParams(filters).toString();
  const path = postsApiPath(type, filters, PAGE_SIZE);
  const state = useAsyncData(
    () => api.get(path),
    [path]
  );
  const optionState = useAsyncData(() => api.get(`/posts/filter-options?post_type=${type}`), [type]);

  const pagination = state.meta?.pagination || {};
  const totalPages = pagination.total_pages || 0;
  const clampedPage = clampPageToTotal(page, pagination.total || 0, pagination.page_size || PAGE_SIZE);
  const pageNeedsClamp = Boolean(state.meta) && clampedPage !== page;

  useEffect(() => {
    if (params.toString() !== canonicalParams) setParams(canonicalParams, { replace: true });
  }, [canonicalParams, params, setParams]);

  useEffect(() => {
    if (!pageNeedsClamp) return;
    const next = new URLSearchParams(params);
    if (clampedPage === 1) next.delete("page");
    else next.set("page", String(clampedPage));
    setParams(next, { replace: true });
  }, [clampedPage, pageNeedsClamp, params, setParams]);

  const changeFilter = (key, value) => {
    setParams(postFilterSearchParams({ ...filters, [key]: value, page: 1 }));
  };

  if (state.loading && !state.data) return <PageLoader />;
  if (state.error) return <main className="page-shell"><ErrorState error={state.error} onRetry={state.reload} /></main>;

  return (
    <main className={`page-shell browse-page browse-page-${isArticle ? "article" : "note"}`} aria-busy={state.loading || pageNeedsClamp || undefined}>
      <BrowseHero isArticle={isArticle} total={pagination.total || 0} latestPost={state.data?.[0]} sort={filters.sort} />

      <PostFilters editorial type={type} filters={filters} options={optionState.data || {}} loading={optionState.loading} onChange={changeFilter} onClear={() => setParams("")} />

      {pageNeedsClamp ? (
        <div className="profile-refresh" role="status">正在返回有效页码…</div>
      ) : !state.data?.length ? (
        <EmptyState title={hasActivePostFilters(filters) ? "当前筛选下没有内容" : `还没有可见${isArticle ? "文章" : "随记"}`} description={hasActivePostFilters(filters) ? "调整或清除筛选条件后再试。" : "这里只会出现你有权读取的已发布或归档内容。"} />
      ) : (
        isArticle
          ? <ArticleMagazine posts={state.data} page={pagination.page || page} total={pagination.total || state.data.length} sort={filters.sort} />
          : <NoteJournal posts={state.data} page={pagination.page || page} total={pagination.total || state.data.length} />
      )}

      <Pagination page={pagination.page || page} totalPages={totalPages} disabled={pageNeedsClamp} onChange={(next) => {
        const nextParams = new URLSearchParams(params);
        nextParams.set("page", String(next));
        setParams(nextParams);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }} />
    </main>
  );
}
