import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { revealCollection } from "../lib/collectionOpening";
import { CustomSelect } from "../components/CustomSelect";
import { Pagination } from "../components/Pagination";
import { PostCard } from "../components/PostCard";
import { ProtectedImage } from "../components/ProtectedImage";
import { MediaOpenButton } from "../components/MediaOpenButton";
import { EmptyState, ErrorState, PageLoader } from "../components/States";
import { useAuth } from "../contexts/AuthContext";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { api } from "../lib/api";
import { useMediaLightbox } from "../contexts/MediaLightboxContext";
import {
  collectionMemoryApiPath,
  collectionMemorySearchParams,
  groupTimelineItems,
  readCollectionMemoryState,
} from "../lib/collectionMemories";
import { formatDate, postHref, postTypeLabel } from "../lib/format";
import { CollectionSketch } from "../components/CollectionSketch";
import { CollectionSharePill } from "../components/CollectionSharePill";
import "../styles/collection-detail-editorial.css";

function MemoryFilters({ data, memory, onChange, media = false }) {
  const patch = (next) => onChange({ ...memory, ...next, page: 1 });
  const activeCount = [memory.year, memory.author, memory.type, media ? memory.mediaKind : ""].filter(Boolean).length;
  return (
    <details className={`collection-memory-filter-drawer ${media ? "is-media" : ""}`}>
      <summary><span></span><strong>筛选</strong><small>{activeCount ? `${activeCount} 项条件已启用` : "年份、作者与内容类型"}</small><i aria-hidden="true" /></summary>
    <div className={`collection-memory-filters ${media ? "is-media" : ""}`} aria-label="共同回忆筛选">
      <label><span>年份</span><CustomSelect value={memory.year} onChange={(event) => patch({ year: event.target.value })}>
        <option value="">全部年份</option>
        {(data?.year_facets || []).map((facet) => <option key={facet.year} value={facet.year}>{facet.year} · {facet.count} 条</option>)}
      </CustomSelect></label>
      <label><span>作者</span><CustomSelect value={memory.author} onChange={(event) => patch({ author: event.target.value })}>
        <option value="">全部作者</option>
        {(data?.authors || []).map((author) => <option key={author.id} value={author.username}>{author.nickname} · {author.count} 条</option>)}
      </CustomSelect></label>
      <label><span>类型</span><CustomSelect value={memory.type} onChange={(event) => patch({ type: event.target.value })}>
        <option value="">全部类型</option><option value="article">文章</option><option value="note">随记</option>
      </CustomSelect></label>
      {media ? <label><span>媒体</span><CustomSelect value={memory.mediaKind} onChange={(event) => patch({ mediaKind: event.target.value })}><option value="">图片与 Live Photo</option><option value="image">图片</option><option value="live_photo">Live Photo</option></CustomSelect></label> : null}
      {(memory.year || memory.author || memory.type || memory.mediaKind) ? <button className="text-button" type="button" onClick={() => patch({ year: "", author: "", type: "", mediaKind: "" })}>清除筛选</button> : null}
    </div>
    </details>
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
    <div className="collection-memory-heading"><div><h2 id="collection-timeline-heading">共同时间轴</h2><p>文章按发布时间，随记按发生时间排列。</p></div>
      {state.data?.year_facets?.length ? <div className="collection-year-jumps" aria-label="年份快速定位">{state.data.year_facets.slice(0, 8).map((facet) => <button key={facet.year} type="button" className={memory.year === String(facet.year) ? "active" : ""} onClick={() => onChange({ ...memory, year: String(facet.year), page: 1 })}>{facet.year}<span>{facet.count}</span></button>)}</div> : null}
    </div>
    <MemoryFilters data={state.data} memory={memory} onChange={onChange} />
    {groups.length ? <div className="collection-timeline">{groups.map((group) => <section key={`${group.year}-${group.month}`} className="collection-timeline-group"><header><strong className="tabular">{group.year}</strong><span>{String(group.month).padStart(2, "0")} 月</span></header><div>{group.items.map((post, index) => <PostCard key={post.id} post={post} compact variant="collection" index={index} />)}</div></section>)}</div> : <EmptyState title="这个时间段还没有共同记录" description="可以切换年份、作者或类型，看看其他时刻。" />}
    <Pagination page={pagination.page || 1} totalPages={pagination.total_pages || 0} onChange={(page) => onChange({ ...memory, page })} />
  </section>;
}

function MediaAccordionRow({ row, offset, items, pagination }) {
  const [active, setActive] = useState(0);
  const [anchored, setAnchored] = useState(false);
  return <div className="collection-media-accordion-row" style={{ "--media-row-count": row.length }} data-anchored={anchored || undefined}>
    {row.map((item, index) => {
      const position = (offset + index) % 5;
      const title = item.post.title || (item.post.post_type === "note" ? "一则随记" : "一篇文章");
      const author = item.author?.nickname || "成员";
      const kind = item.kind === "live_photo" ? "Live Photo" : "图片";
      return <article key={item.id} className={`collection-media-memory${active === index ? " is-expanded" : ""}`} style={{ "--media-grid-column": position === 0 ? "span 7" : position === 1 ? "span 5" : "span 4", "--media-grid-ratio": position < 2 ? "16 / 10" : "4 / 3" }}
        onPointerEnter={(event) => {
          if (event.pointerType !== "mouse" || event.currentTarget.parentElement.querySelector(":focus-visible")) return;
          setAnchored(false);
          setActive(index);
        }}
        onFocusCapture={() => setActive(index)}
        // Settle the opener before its existing click handler measures the photo.
        onPointerDownCapture={(event) => {
          if (event.target.closest(".media-lightbox-trigger")) { setAnchored(true); setActive(index); }
        }}>
        <MediaOpenButton item={item} items={items} context="collection" pagination={pagination} label={`在灯箱中查看${author}的${kind}：${title}`}><ProtectedImage media={item.image} alt={`来自${author}的共同影像：${title}`} /></MediaOpenButton>
        <Link to={postHref(item.post)} className="collection-media-caption"><strong>{title}</strong><small><span>{author}</span><time dateTime={item.occurred_at || undefined}>{formatDate(item.occurred_at)}</time></small><span className="collection-media-kind">{kind} / {postTypeLabel(item.post.post_type)}</span></Link>
      </article>;
    })}
  </div>;
}

function MediaWallView({ slug, memory, onChange }) {
  const { hydrateGallery } = useMediaLightbox();
  const path = collectionMemoryApiPath(slug, memory, 24);
  const state = useAsyncData(() => api.get(path), [path]);
  const pagination = state.meta?.pagination || {};
  const loadPage = async (page) => {
    const result = await api.get(collectionMemoryApiPath(slug, { ...memory, page }, 24));
    return { items: result.data?.items || [] };
  };
  useEffect(() => {
    if (!state.data?.items?.length) return;
    hydrateGallery({
      items: state.data.items,
      context: "collection",
      pagination: {
        page: pagination.page || memory.page,
        pageSize: pagination.page_size || 24,
        total: pagination.total || state.data.items.length,
        totalPages: pagination.total_pages || 1,
        loadPage,
      },
    });
  // loadPage deliberately captures the current filters; data identity changes with them.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrateGallery, pagination.page, pagination.page_size, pagination.total, pagination.total_pages, state.data?.items]);
  if (state.loading) return <PageLoader label="正在整理共同影像" />;
  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  const items = state.data?.items || [];
  const rowCount = Math.ceil(items.length / 5);
  const rows = Array.from({ length: rowCount }, (_, index) => {
    const offset = Math.floor(index * items.length / rowCount);
    return { offset, items: items.slice(offset, Math.floor((index + 1) * items.length / rowCount)) };
  });
  return <section className="collection-memory-view" aria-labelledby="collection-media-heading">
    <div className="collection-memory-heading"><div><h2 id="collection-media-heading">共同影像</h2><p></p></div></div>
    <MemoryFilters data={state.data} memory={memory} onChange={onChange} media />
    {items.length ? <div className={`collection-media-wall${items.length > 2 ? " has-accordion" : ""}`}>{rows.map((row) => <MediaAccordionRow key={`${path}:${row.items.map((item) => item.id).join(",")}`} row={row.items} offset={row.offset} items={items} pagination={{ page: pagination.page || memory.page, pageSize: pagination.page_size || 24, total: pagination.total || items.length, totalPages: pagination.total_pages || 1, loadPage }} />)}</div> : <EmptyState title="这里还没有可展示的共同影像" description="为合集中的记录添加图片或 Live Photo 后，它们会出现在这里。" />}
    <Pagination page={pagination.page || 1} totalPages={pagination.total_pages || 0} onChange={(page) => onChange({ ...memory, page })} />
  </section>;
}

function CollectionOverview({ collection, notificationPreference, onSaveNotificationPreference }) {
  const members = [collection.creator, ...(collection.members || [])];
  return (
    <div className="collection-overview-layout">
      <div className="collection-overview-main">
        {collection.highlights?.length ? (
          <section className="collection-overview-section collection-highlights" aria-labelledby="collection-highlights-title">
            <header className="collection-spread-heading">
              <h2 id="collection-highlights-title">关键记录</h2>
              <p>由创建者挑选的共同片段。</p>
            </header>
            <div className="collection-highlight-grid">{collection.highlights.map((post) => <PostCard key={post.id} post={post} compact />)}</div>
          </section>
        ) : null}

        <section className="collection-overview-section collection-posts-section" aria-labelledby="collection-posts-title">
          <header className="collection-spread-heading">
            <h2 id="collection-posts-title">合集内容</h2>
            <p>当前收录 {collection.posts?.length || 0} 则记录。</p>
          </header>
          {collection.posts?.length
            ? <div className="collection-post-catalogue">{collection.posts.map((post, index) => <PostCard key={post.id} post={post} compact variant="collection" index={index} />)}</div>
            : <EmptyState title="这个合集还没有已发布内容" description="创建者与成员都可以在这里发表自己的记录。" />}
        </section>
      </div>

      <aside className="collection-overview-index" aria-label="合集卷内索引">
        <section className="collection-index-section" aria-labelledby="collection-members-title">
          <header><h2 id="collection-members-title">合集成员</h2><p>{members.length} 位合集成员。</p></header>
          <div className="collection-member-index">
            {members.map((member, index) => (
              <Link key={`${member.id}-${index}`} to={`/users/${member.username}`}>
                <strong>{member.nickname}</strong>
                <small>{index === 0 ? "创建者" : "共同成员"}</small>
              </Link>
            ))}
          </div>
        </section>

        <section className="collection-index-section collection-notification-preference" aria-labelledby="collection-notification-title">
          <div><h2 id="collection-notification-title">合集通知</h2><p>互动与管理通知包括评论、回复、提及和回忆补充。静音后仍接收成员变更、合集转让和你的内容被移出等管理通知。</p></div>
          <CustomSelect aria-label="合集通知偏好" disabled={notificationPreference.loading || notificationPreference.saving} value={notificationPreference.level} onChange={(event) => { void onSaveNotificationPreference(event.target.value); }}><option value="all">全部通知</option><option value="important">互动与管理通知</option><option value="muted">静音</option></CustomSelect>
          {notificationPreference.error ? <small className="field-error">{notificationPreference.error}</small> : null}
          {notificationPreference.message ? <small>{notificationPreference.message}</small> : null}
        </section>
      </aside>
    </div>
  );
}

export function CollectionDetailPage() {
  const { slug } = useParams();
  const coverRef = useRef(null);
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const memory = readCollectionMemoryState(searchParams);
  const state = useAsyncData(() => api.get(`/collections/${encodeURIComponent(slug)}`), [slug]);
  const [membership, setMembership] = useState(null);
  const [notificationPreference, setNotificationPreference] = useState({ level: "all", loading: true, saving: false, message: "", error: "" });
  usePageMeta(state.data?.name || "合集");
  useEffect(() => {
    if (!state.data?.id) return;
    let active = true;
    setNotificationPreference((current) => ({ ...current, loading: true, error: "" }));
    api.get(`/collections/${state.data.id}/notification-preference`).then((result) => {
      if (active) setNotificationPreference({ level: result.data.level, loading: false, saving: false, message: "", error: "" });
    }).catch((error) => {
      if (active) setNotificationPreference((current) => ({ ...current, loading: false, error: error.message }));
    });
    return () => { active = false; };
  }, [state.data?.id]);
  const saveNotificationPreference = async (level) => {
    const previous = notificationPreference.level;
    setNotificationPreference({ level, loading: false, saving: true, message: "", error: "" });
    try {
      const result = await api.put(`/collections/${state.data.id}/notification-preference`, { level });
      setNotificationPreference({ level: result.data.level, loading: false, saving: false, message: "通知偏好已保存。", error: "" });
    } catch (error) {
      setNotificationPreference({ level: previous, loading: false, saving: false, message: "", error: error.message });
    }
  };
  useLayoutEffect(() => {
    if (state.data && !state.loading && !state.error) revealCollection(slug, coverRef.current);
  }, [slug, state.data, state.loading, state.error]);

  const changeMemory = (next) => setSearchParams(collectionMemorySearchParams(next));
  const changeView = (view) => changeMemory({ ...memory, view, page: 1 });
  if (state.loading) return <PageLoader />;
  if (state.error) return <main className="page-shell"><ErrorState error={state.error} onRetry={state.reload} /></main>;
  const collection = membership?.id === state.data.id ? { ...state.data, ...membership } : state.data;
  const updateMembership = (next) => setMembership({
    id: collection.id,
    creator: next.creator,
    members: next.members,
    auto_add_future_members: next.auto_add_future_members ?? collection.auto_add_future_members,
  });
  return <main className="page-shell collection-memory-page">
    <header className="collection-hero collection-volume-hero">
      <div ref={coverRef} className="collection-volume-cover-frame"><ProtectedImage media={collection.cover_media} useOriginal alt="" className="collection-hero-cover" fallback={<div className="collection-volume-fallback" aria-hidden="true"><span></span><CollectionSketch /><strong>{collection.name}</strong><small>{formatDate(collection.updated_at)}</small></div>} /></div>
      <div className="collection-volume-copy">
        <Link className="collection-volume-back" to="/collections">返回合集目录</Link>
        <span className="collection-volume-kicker"></span>
        <h1>{collection.name}</h1>
        {collection.description ? <p>{collection.description}</p> : <p></p>}
        <dl className="collection-volume-facts">
          <div><dt>创建者</dt><dd><Link to={`/users/${collection.creator.username}`}>{collection.creator.nickname}</Link></dd></div>
          <div><dt>合集成员</dt><dd>{(collection.members?.length || 0) + 1} 人</dd></div>
          <div><dt>更新于</dt><dd>{formatDate(collection.updated_at)}</dd></div>
        </dl>
        <CollectionSharePill key={`${collection.id}-${collection.creator.id}-${user.id}`} collection={collection} user={user} onMembersChange={updateMembership} />
        <div className="collection-hero-actions">{collection.creator.id === user.id ? <Link className="btn btn-secondary" to={`/collections/${collection.slug}/manage`}>管理合集</Link> : null}<Link className="btn btn-primary" to={`/write?collection=${collection.id}`}>添加记录</Link></div>
      </div>
    </header>
    <nav className="collection-memory-nav collection-volume-nav" aria-label="合集阅读视图">
      <button type="button" aria-pressed={memory.view === "timeline"} className={memory.view === "timeline" ? "active" : ""} onClick={() => changeView("timeline")}><strong>共同时间轴</strong></button>
      <button type="button" aria-pressed={memory.view === "overview"} className={memory.view === "overview" ? "active" : ""} onClick={() => changeView("overview")}><strong>合集内容</strong></button>
      <button type="button" aria-pressed={memory.view === "media"} className={memory.view === "media" ? "active" : ""} onClick={() => changeView("media")}><strong>共同影像</strong></button>
    </nav>
    {memory.view === "timeline" ? <TimelineView slug={slug} memory={memory} onChange={changeMemory} /> : null}
    {memory.view === "media" ? <MediaWallView slug={slug} memory={memory} onChange={changeMemory} /> : null}
    {memory.view === "overview" ? <CollectionOverview collection={collection} notificationPreference={notificationPreference} onSaveNotificationPreference={saveNotificationPreference} /> : null}
  </main>;
}
