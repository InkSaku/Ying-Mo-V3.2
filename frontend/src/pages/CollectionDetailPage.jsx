import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { PostCard } from "../components/PostCard";
import { EmptyState, ErrorState, PageLoader } from "../components/States";
import { formatDate } from "../lib/format";
import { ProtectedImage } from "../components/ProtectedImage";
import { useAuth } from "../contexts/AuthContext";

export function CollectionDetailPage() {
  const { slug } = useParams();
  const { user } = useAuth();
  const state = useAsyncData(() => api.get(`/collections/${encodeURIComponent(slug)}`), [slug]);
  usePageMeta(state.data?.name || "合集");

  if (state.loading) return <PageLoader />;
  if (state.error) return <main className="page-shell"><ErrorState error={state.error} onRetry={state.reload} /></main>;
  const collection = state.data;

  return (
    <main className="page-shell">
      <header className="collection-hero">
        <ProtectedImage media={collection.cover_media} useOriginal alt="" className="collection-hero-cover" />
        <div>
          <p className="hero-kicker">Collection</p>
          <h1>{collection.name}</h1>
          {collection.description ? <p>{collection.description}</p> : null}
          <div className="collection-meta">
            <span>创建者 <Link to={`/users/${collection.creator.username}`}>{collection.creator.nickname}</Link></span>
            <span>更新于 {formatDate(collection.updated_at)}</span>
          </div>
        </div>
        <div className="collection-hero-actions">
          {collection.creator.id === user.id ? <Link className="btn btn-secondary" to={`/collections/${collection.slug}/manage`}>管理 Collection</Link> : null}
          <Link className="btn btn-primary" to={`/write?collection=${collection.id}`}>向这里投稿</Link>
        </div>
      </header>

      <section className="content-section">
        <h2>共同成员</h2>
        <div className="member-list">
          <Link to={`/users/${collection.creator.username}`}>{collection.creator.nickname} <span>创建者</span></Link>
          {collection.members?.map((member) => (
            <Link key={member.id} to={`/users/${member.username}`}>{member.nickname}</Link>
          ))}
        </div>
      </section>

      <section className="content-section">
        <h2>合集内容</h2>
        {collection.posts?.length
          ? <div className="note-stream">{collection.posts.map((post) => <PostCard key={post.id} post={post} compact />)}</div>
          : <EmptyState title="这个合集还没有已发布内容" description="创建者与成员都可以在这里发表自己的记录。" />}
      </section>
    </main>
  );
}
