import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { createExploreSeed, exploreApiPath, normalizeExploreSeed } from "../lib/explore";
import { memoryDayLabel } from "../lib/onThisDay";
import { CollectionCard } from "../components/CollectionCard";
import { MemoryCard } from "../components/MemoryCard";
import { MemberCard } from "../components/MemberCard";
import { PostCard } from "../components/PostCard";
import { SectionHeader } from "../components/SectionHeader";
import { ErrorState } from "../components/States";

function ExploreEmpty({ children }) {
  return <div className="explore-section-empty"><p>{children}</p></div>;
}

function ExploreLoader() {
  return (
    <main className="page-shell explore-page explore-page-loading" aria-busy="true" aria-live="polite">
      <span className="sr-only">正在寻找可以偶遇的内容</span>
      <div className="explore-loader-hero">
        <div>
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
  return (
    <main className="page-shell explore-page" aria-busy={state.loading || undefined}>
      <header className="explore-hero">
        <div className="explore-hero-copy">
          <p className="hero-kicker">Explore</p>
          <h1>朋友内容漫游</h1>
          <p>不按热度，也不猜测喜好。只是从你当前有权阅读的内容里，换一条路慢慢看看。</p>
        </div>
        <aside className="explore-issue" aria-label="本次漫游概览">
          <div className="explore-issue-metrics">
            <span><strong>{data.random_articles?.length || 0}</strong> 文章</span>
            <span><strong>{data.random_notes?.length || 0}</strong> 随记</span>
            <span><strong>{data.roaming_tags?.length || 0}</strong> 标签</span>
          </div>
          <p>每次换一批只改变路径，不改变权限，也不形成推荐画像。</p>
          <button className="btn btn-primary" type="button" disabled={state.loading} onClick={shuffle}>
            {state.loading ? "正在换一批" : "换一批内容"}
          </button>
        </aside>
      </header>

      <section className="content-section explore-section explore-article-section">
        <SectionHeader title="随便读一篇" description="从可见的正式文章中稳定抽取，不参考阅读量或点赞数。" actions={<Link to="/articles">全部文章</Link>} />
        {data.random_articles?.length
          ? <div className="explore-article-layout">{data.random_articles.map((post, index) => (
              <div className={`explore-article-slot ${index === 0 ? "is-leading" : ""}`} key={post.id}>
                <PostCard post={post} compact={index !== 0} />
              </div>
            ))}</div>
          : <ExploreEmpty>当前还没有可以漫游的 Article。</ExploreEmpty>}
      </section>

      <section className="content-section explore-section explore-note-section">
        <SectionHeader title="生活片段" description="偶遇朋友留下的 Note、照片、地点与心情。" actions={<Link to="/notes">全部随记</Link>} />
        {data.random_notes?.length
          ? <div className="explore-note-rail">{data.random_notes.map((post) => <PostCard key={post.id} post={post} compact />)}</div>
          : <ExploreEmpty>当前还没有可以漫游的 Note。</ExploreEmpty>}
      </section>

      <div className="content-section explore-index-layout">
        <section className="explore-index-section" aria-labelledby="explore-tags-title">
          <header className="explore-index-header">
            <div>
              <h2 id="explore-tags-title">沿着标签走</h2>
              <p>数量只来自你当前能读到的内容。</p>
            </div>
            <Link to="/tags">全部标签</Link>
          </header>
          {data.roaming_tags?.length ? (
            <nav className="explore-tag-index" aria-label="漫游标签">
              {data.roaming_tags.map((tag) => (
                <Link key={tag.id} to={`/tags/${tag.slug}`}>
                  <strong>#{tag.name}</strong>
                  <span>{tag.visible_post_count} 篇</span>
                </Link>
              ))}
            </nav>
          ) : <ExploreEmpty>当前还没有可见 Tag。</ExploreEmpty>}
        </section>

        <section className="explore-index-section explore-collection-index" aria-labelledby="explore-collections-title">
          <header className="explore-index-header">
            <div>
              <h2 id="explore-collections-title">进入一册合集</h2>
              <p>只展示你已经加入的精选 Collection。</p>
            </div>
            <Link to="/collections">全部合集</Link>
          </header>
          {data.featured_collections?.length
            ? <div className="explore-collection-grid">{data.featured_collections.map((item) => <CollectionCard key={item.id} collection={item} />)}</div>
            : <ExploreEmpty>当前没有你可以进入的精选 Collection。</ExploreEmpty>}
        </section>
      </div>

      <section className="content-section explore-memory-section">
        <header className="explore-memory-header">
          <div>
            <p>{memoryDayLabel(data.on_this_day)}</p>
            <h2>往年今日</h2>
            <span>重新遇见旧日片段。</span>
          </div>
          <Link to="/on-this-day">查看全部</Link>
        </header>
        <div className="explore-memory-content">
          {data.on_this_day?.items?.length
            ? <div className="explore-memory-grid">{data.on_this_day.items.map((post) => <MemoryCard key={post.id} post={post} />)}</div>
            : <ExploreEmpty>今天暂时没有你可见的旧日记录。</ExploreEmpty>}
        </div>
      </section>

      <section className="content-section explore-section explore-member-section">
        <SectionHeader title="新朋友" description="最近加入的成员，仅展示公开资料，不进行活跃度或贡献排名。" />
        {data.recent_members?.length
          ? <div className="explore-member-grid">{data.recent_members.map((member) => <MemberCard key={member.id} member={member} />)}</div>
          : <ExploreEmpty>暂时还没有其他成员。</ExploreEmpty>}
      </section>
    </main>
  );
}
