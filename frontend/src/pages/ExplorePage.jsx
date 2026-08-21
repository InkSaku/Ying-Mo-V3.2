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
import { ErrorState, PageLoader } from "../components/States";

function ExploreEmpty({ children }) {
  return <p className="explore-section-empty">{children}</p>;
}

export function ExplorePage() {
  usePageMeta("漫游");
  const [params, setParams] = useSearchParams();
  const seed = normalizeExploreSeed(params.get("seed"));
  const state = useAsyncData(() => api.get(exploreApiPath(seed)), [seed]);

  if (state.loading && !state.data) return <PageLoader label="正在寻找可以偶遇的内容" />;
  if (state.error) return <main className="page-shell"><ErrorState error={state.error} onRetry={state.reload} /></main>;

  const data = state.data || {};
  const shuffle = () => setParams({ seed: createExploreSeed() });
  return (
    <main className="page-shell explore-page" aria-busy={state.loading || undefined}>
      <header className="explore-hero">
        <div>
          <p className="hero-kicker">Explore</p>
          <h1>朋友内容漫游</h1>
          <p>不按热度，也不猜测喜好。只是从你当前有权阅读的内容里，换一条路慢慢看看。</p>
        </div>
        <button className="btn btn-primary" type="button" disabled={state.loading} onClick={shuffle}>
          {state.loading ? "正在换一批" : "换一批"}
        </button>
      </header>

      <section className="content-section explore-section">
        <SectionHeader title="随便读一篇" description="从可见的正式文章中稳定抽取，不参考阅读量或点赞数。" actions={<Link to="/articles">全部文章</Link>} />
        {data.random_articles?.length
          ? <div className="two-column-grid">{data.random_articles.map((post) => <PostCard key={post.id} post={post} />)}</div>
          : <ExploreEmpty>当前还没有可以漫游的 Article。</ExploreEmpty>}
      </section>

      <section className="content-section explore-section">
        <SectionHeader title="生活片段" description="偶遇朋友留下的 Note、照片、地点与心情。" actions={<Link to="/notes">全部随记</Link>} />
        {data.random_notes?.length
          ? <div className="note-stream">{data.random_notes.map((post) => <PostCard key={post.id} post={post} compact />)}</div>
          : <ExploreEmpty>当前还没有可以漫游的 Note。</ExploreEmpty>}
      </section>

      <section className="content-section explore-section">
        <SectionHeader title="Tag 漫游" description="每个数量都只统计你当前有权阅读的内容。" actions={<Link to="/tags">全部标签</Link>} />
        {data.roaming_tags?.length ? (
          <div className="explore-tag-cloud">
            {data.roaming_tags.map((tag) => (
              <Link key={tag.id} to={`/tags/${tag.slug}`}>
                <strong>#{tag.name}</strong>
                <span>{tag.visible_post_count} 篇</span>
              </Link>
            ))}
          </div>
        ) : <ExploreEmpty>当前还没有可见 Tag。</ExploreEmpty>}
      </section>

      <section className="content-section explore-section">
        <SectionHeader title="精选 Collection" description="只展示你已经是 creator 或 member 的精选合集。" actions={<Link to="/collections">全部合集</Link>} />
        {data.featured_collections?.length
          ? <div className="collection-grid">{data.featured_collections.map((item) => <CollectionCard key={item.id} collection={item} />)}</div>
          : <ExploreEmpty>当前没有你可以进入的精选 Collection。</ExploreEmpty>}
      </section>

      <section className="content-section explore-section explore-memory-section">
        <SectionHeader title="往年今日" description={`${memoryDayLabel(data.on_this_day)}，重新遇见旧日片段。`} actions={<Link to="/on-this-day">查看全部</Link>} />
        {data.on_this_day?.items?.length
          ? <div className="memory-grid">{data.on_this_day.items.map((post) => <MemoryCard key={post.id} post={post} />)}</div>
          : <ExploreEmpty>今天暂时没有你可见的旧日记录。</ExploreEmpty>}
      </section>

      <section className="content-section explore-section">
        <SectionHeader title="新朋友" description="最近加入的成员，仅展示公开资料，不进行活跃度或贡献排名。" />
        {data.recent_members?.length
          ? <div className="explore-member-grid">{data.recent_members.map((member) => <MemberCard key={member.id} member={member} />)}</div>
          : <ExploreEmpty>暂时还没有其他成员。</ExploreEmpty>}
      </section>
    </main>
  );
}
