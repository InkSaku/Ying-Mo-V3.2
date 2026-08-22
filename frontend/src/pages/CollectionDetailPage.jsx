import { Link, useParams, useSearchParams } from "react-router-dom";
import { CustomSelect } from "../components/CustomSelect";
import { Pagination } from "../components/Pagination";
import { PostCard } from "../components/PostCard";
import { ProtectedImage } from "../components/ProtectedImage";
import { EmptyState, ErrorState, PageLoader } from "../components/States";
import { useAuth } from "../contexts/AuthContext";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { api } from "../lib/api";
import {
  collectionMemoryApiPath,
  collectionMemorySearchParams,
  groupTimelineItems,
  readCollectionMemoryState,
} from "../lib/collectionMemories";
import { formatDate, postHref, postTypeLabel } from "../lib/format";

function MemoryFilters({ data, memory, onChange }) {
  const patch = (next) => onChange({ ...memory, ...next, page: 1 });
  return (
    <div className="collection-memory-filters" aria-label="共同回忆筛选">
      <label><span>年份</span><CustomSelect value={memory.year} onChange={(event) => patch({ year: event.target.value })}>
        <option value="">全部年份</option>
        {(data?.year_facets || []).map((facet) => <option key={facet.year} value={facet.year}>{facet.year} · {facet.count} 条</option>)}
      </CustomSelect></label>
      <label><span>作者</span><CustomSelect value={memory.author} onChange={(event) => patch({ author: event.target.value })}>
        <option value="">全部作者</option>
        {(data?.authors || []).map((author) => <option key={author.id} value={author.username}>{author.nickname} · {author.count} 条</option>)}
      </CustomSelect></label>
      <label><span>类型</span><CustomSelect value={memory.type} onChange={(event) => patch({ type: event.target.value })}>
        <option value="">全部类型</option><option value="article">Article</option><option value="note">Note</option>
      </CustomSelect></label>
      {(memory.year || memory.author || memory.type) ? <button className="text-button" type="button" onClick={() => patch({ year: "", author: "", type: "" })}>清除筛选</button> : null}
    </div>
  );
}

function TimelineView({ slug, memory, onChange }) {
  const path = collectionMemoryApiPath(slug, memory, 20);
  const state = useAsyncData(() => api.get(path), [path]);
  if (state.loading) return <PageLoader label="正在整理共同时间轴" />;
  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  const groups = groupTimelineItems(state.data?.items || []);
  const pagination = state.meta?.pagination || {};
  return <section className="collection-memory-view" aria-labelledby="collection-timeline-heading">
    <div className="collection-memory-heading"><div><p className="hero-kicker">Shared timeline</p><h2 id="collection-timeline-heading">共同时间轴</h2><p>按记录真正发生的时间，重新阅读一起走过的日子。</p></div>
      {state.data?.year_facets?.length ? <div className="collection-year-jumps" aria-label="年份快速定位">{state.data.year_facets.slice(0, 8).map((facet) => <button key={facet.year} type="button" className={memory.year === String(facet.year) ? "active" : ""} onClick={() => onChange({ ...memory, year: String(facet.year), page: 1 })}>{facet.year}<span>{facet.count}</span></button>)}</div> : null}
    </div>
    <MemoryFilters data={state.data} memory={memory} onChange={onChange} />
    {groups.length ? <div className="collection-timeline">{groups.map((group) => <section key={`${group.year}-${group.month}`} className="collection-timeline-group"><header><strong className="tabular">{group.year}</strong><span>{String(group.month).padStart(2, "0")} 月</span></header><div>{group.items.map((post) => <PostCard key={post.id} post={post} compact />)}</div></section>)}</div> : <EmptyState title="这个时间段还没有共同记录" description="可以切换年份、作者或类型，看看其他时刻。" />}
    <Pagination page={pagination.page || 1} totalPages={pagination.total_pages || 0} onChange={(page) => onChange({ ...memory, page })} />
  </section>;
}

function MediaWallView({ slug, memory, onChange }) {
  const path = collectionMemoryApiPath(slug, memory, 24);
  const state = useAsyncData(() => api.get(path), [path]);
  if (state.loading) return <PageLoader label="正在整理共同影像" />;
  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  const pagination = state.meta?.pagination || {};
  return <section className="collection-memory-view" aria-labelledby="collection-media-heading">
    <div className="collection-memory-heading"><div><p className="hero-kicker">Shared images</p><h2 id="collection-media-heading">共同影像</h2><p>图片与 Live Photo 始终留在原记录里，这里只是另一种回看方式。</p></div></div>
    <MemoryFilters data={state.data} memory={memory} onChange={onChange} />
    {state.data?.items?.length ? <div className="collection-media-wall">{state.data.items.map((item) => <Link key={item.media.id} to={postHref(item.post)} className="collection-media-memory"><ProtectedImage media={item.media} alt={`来自${item.post.author?.nickname || "成员"}的共同影像`} /><span className="collection-media-caption"><strong>{item.post.title || (item.post.post_type === "note" ? "一则随记" : "一篇文章")}</strong><small>{item.post.author?.nickname} · {formatDate(item.post.semantic_time)} · {postTypeLabel(item.post.post_type)}</small></span>{item.media.live_photo_pair_id ? <span className="collection-live-badge">Live Photo</span> : null}</Link>)}</div> : <EmptyState title="这里还没有可展示的共同影像" description="为 Collection 中的记录添加图片或 Live Photo 后，会安全地出现在这里。" />}
    <Pagination page={pagination.page || 1} totalPages={pagination.total_pages || 0} onChange={(page) => onChange({ ...memory, page })} />
  </section>;
}

export function CollectionDetailPage() {
  const { slug } = useParams();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const memory = readCollectionMemoryState(searchParams);
  const state = useAsyncData(() => api.get(`/collections/${encodeURIComponent(slug)}`), [slug]);
  usePageMeta(state.data?.name || "合集");
  const changeMemory = (next) => setSearchParams(collectionMemorySearchParams(next));
  const changeView = (view) => changeMemory({ ...memory, view, page: 1 });
  if (state.loading) return <PageLoader />;
  if (state.error) return <main className="page-shell"><ErrorState error={state.error} onRetry={state.reload} /></main>;
  const collection = state.data;
  return <main className="page-shell collection-memory-page">
    <header className="collection-hero"><ProtectedImage media={collection.cover_media} useOriginal alt="" className="collection-hero-cover" /><div><p className="hero-kicker">Collection</p><h1>{collection.name}</h1>{collection.description ? <p>{collection.description}</p> : null}<div className="collection-meta"><span>创建者 <Link to={`/users/${collection.creator.username}`}>{collection.creator.nickname}</Link></span><span>更新于 {formatDate(collection.updated_at)}</span></div></div><div className="collection-hero-actions">{collection.creator.id === user.id ? <Link className="btn btn-secondary" to={`/collections/${collection.slug}/manage`}>管理 Collection</Link> : null}<Link className="btn btn-primary" to={`/write?collection=${collection.id}`}>向这里投稿</Link></div></header>
    <nav className="collection-memory-nav" aria-label="Collection 阅读视图"><button type="button" className={memory.view === "overview" ? "active" : ""} onClick={() => changeView("overview")}>合集内容</button><button type="button" className={memory.view === "timeline" ? "active" : ""} onClick={() => changeView("timeline")}>共同时间轴</button><button type="button" className={memory.view === "media" ? "active" : ""} onClick={() => changeView("media")}>共同影像</button></nav>
    {memory.view === "timeline" ? <TimelineView slug={slug} memory={memory} onChange={changeMemory} /> : null}
    {memory.view === "media" ? <MediaWallView slug={slug} memory={memory} onChange={changeMemory} /> : null}
    {memory.view === "overview" ? <>{collection.highlights?.length ? <section className="content-section collection-highlights"><div className="collection-memory-heading"><div><p className="hero-kicker">Highlights</p><h2>关键记录</h2><p>由 Collection 创建者挑选的共同片段。</p></div></div><div className="note-stream">{collection.highlights.map((post) => <PostCard key={post.id} post={post} compact />)}</div></section> : null}<section className="content-section"><h2>共同成员</h2><div className="member-list"><Link to={`/users/${collection.creator.username}`}>{collection.creator.nickname} <span>创建者</span></Link>{collection.members?.map((member) => <Link key={member.id} to={`/users/${member.username}`}>{member.nickname}</Link>)}</div></section><section className="content-section"><h2>合集内容</h2>{collection.posts?.length ? <div className="note-stream">{collection.posts.map((post) => <PostCard key={post.id} post={post} compact />)}</div> : <EmptyState title="这个合集还没有已发布内容" description="创建者与成员都可以在这里发表自己的记录。" />}</section></> : null}
  </main>;
}
