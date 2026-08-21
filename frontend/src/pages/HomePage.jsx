import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { PageLoader, ErrorState, EmptyState } from "../components/States";
import { PostCard } from "../components/PostCard";
import { CollectionCard } from "../components/CollectionCard";
import { SectionHeader } from "../components/SectionHeader";
import { MemoryCard } from "../components/MemoryCard";
import { memoryDayLabel } from "../lib/onThisDay";

export function HomePage() {
  usePageMeta("首页");
  const state = useAsyncData(() => api.get("/home"), []);

  if (state.loading) return <PageLoader />;
  if (state.error) return <main className="page-shell"><ErrorState error={state.error} onRetry={state.reload} /></main>;

  const data = state.data || {};
  return (
    <main className="page-shell home-page">
      <section className="member-hero">
        <div>
          <p className="hero-kicker">你的映墨</p>
          <h1>继续记录，也继续阅读朋友的近况。</h1>
          <p>这里仅展示你当前有权访问的内容。Collection 的阅读范围完全以后端成员关系为准。</p>
        </div>
        <div className="member-hero-actions">
          <Link className="btn btn-primary" to="/write">新建记录</Link>
          <Link className="btn btn-secondary" to="/collections/new">创建合集</Link>
        </div>
      </section>

      <section className="content-section home-memory-section">
        <SectionHeader
          title="往年今日"
          description={`${memoryDayLabel(data.on_this_day)}，重新遇见过去的记录。`}
          actions={<Link to="/on-this-day">查看全部</Link>}
        />
        {data.on_this_day?.items?.length ? (
          <div className="memory-grid home-memory-grid">
            {data.on_this_day.items.map((item) => <MemoryCard key={item.id} post={item} />)}
          </div>
        ) : (
          <div className="home-memory-empty">
            <p>今天暂时没有旧日记录。</p>
            <Link to="/archive">翻阅时间归档</Link>
          </div>
        )}
      </section>

      {data.featured_articles?.length ? (
        <section className="content-section">
          <SectionHeader title="精选文章" />
          <div className="two-column-grid">{data.featured_articles.map((item) => <PostCard key={item.id} post={item} />)}</div>
        </section>
      ) : null}

      {data.featured_collections?.length ? (
        <section className="content-section">
          <SectionHeader title="精选 Collection" />
          <div className="collection-grid">{data.featured_collections.map((item) => <CollectionCard key={item.id} collection={item} />)}</div>
        </section>
      ) : null}

      <section className="content-section">
        <SectionHeader title="最近文章" actions={<Link to="/articles">查看全部</Link>} />
        {data.recent_articles?.length
          ? <div className="two-column-grid">{data.recent_articles.map((item) => <PostCard key={item.id} post={item} />)}</div>
          : <EmptyState title="还没有文章" description="发布第一篇 Article 后，它会出现在这里。" action={<Link className="btn btn-secondary" to="/write?type=article">写文章</Link>} />}
      </section>

      <section className="content-section">
        <SectionHeader title="最近随记" actions={<Link to="/notes">查看全部</Link>} />
        {data.recent_notes?.length
          ? <div className="note-stream">{data.recent_notes.map((item) => <PostCard key={item.id} post={item} compact />)}</div>
          : <EmptyState title="还没有随记" description="Note 适合保存片段、地点、心情与日常。" action={<Link className="btn btn-secondary" to="/write?type=note">写随记</Link>} />}
      </section>

      <section className="content-section">
        <SectionHeader title="我的 Collection" actions={<Link to="/collections">查看全部</Link>} />
        {data.collections?.length
          ? <div className="collection-grid">{data.collections.map((item) => <CollectionCard key={item.id} collection={item} />)}</div>
          : <EmptyState title="还没有可访问的合集" description="你可以创建自己的 Collection，或者等待朋友把你加入共同记录。" />}
      </section>
    </main>
  );
}
