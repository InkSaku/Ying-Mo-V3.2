import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { excerpt, formatDate, postHref } from "../lib/format";
import { MemoryContributionComposer } from "./MemoryContributionComposer";
import { ProtectedImage } from "./ProtectedImage";

export function SharedMemorySection({ post, onPostChanged }) {
  const [thread, setThread] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const sectionRef = useRef(null);

  const load = useCallback(async (page = 1, append = false) => {
    if (!post.memory) return;
    setLoading(true);
    setError("");
    try {
      const result = await api.get(`/posts/${post.id}/memory-thread?page=${page}&page_size=20`);
      setThread((current) => append && current ? {
        ...result.data,
        items: [...current.items, ...result.data.items],
      } : result.data);
      setPagination(result.meta?.pagination || null);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [post.id, post.memory]);

  useEffect(() => { void load(); }, [load]);
  if (!post.memory) return null;
  const data = thread || post.memory;
  const count = data.contribution_count || 0;
  const participants = data.participant_count || 1;

  return (
    <section ref={sectionRef} id="shared-memory" className="shared-memory" aria-labelledby="shared-memory-title">
      <header className="shared-memory-heading">
        <div><p className="section-kicker">Shared memory</p><h2 id="shared-memory-title">共同回忆</h2><p>{participants} 人留下了 {count + 1} 条记录。</p></div>
        {data.can_contribute ? <button className="btn btn-primary" type="button" onClick={() => setOpen((value) => !value)}>{open ? "收起补充" : "补充我的视角"}</button> : null}
      </header>
      {open && thread ? <MemoryContributionComposer
        rootPost={thread.root_post}
        collection={thread.collection}
        defaults={thread.composer_defaults}
        onClose={() => setOpen(false)}
        onPublished={async () => {
          setOpen(false);
          await load();
          await onPostChanged?.();
          window.requestAnimationFrame(() => sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
        }}
      /> : null}
      {loading && !thread ? <p className="meta-text" role="status">正在读取共同回忆…</p> : null}
      {error ? <div className="inline-error" role="alert"><span>{error}</span><button className="text-button" type="button" onClick={() => void load()}>重新读取</button></div> : null}
      {thread?.items?.length ? <div className="shared-memory-list">{thread.items.map((item) => (
        <article key={item.id} className={item.id === thread.current_post_id ? "is-current" : ""}>
          <div className="shared-memory-item-copy">
            <p><strong>{item.author?.nickname || item.author?.username || "成员"}</strong><span>补充于 <time dateTime={item.published_at}>{formatDate(item.published_at, true)}</time></span>{item.id === thread.current_post_id ? <em>正在阅读</em> : null}</p>
            <Link to={postHref(item)}>{excerpt(item) || "查看这条影像补充"}</Link>
          </div>
          {item.display_media ? <Link to={postHref(item)} className="shared-memory-thumb"><ProtectedImage media={item.display_media} alt="" /></Link> : null}
        </article>
      ))}</div> : (!loading && thread ? <p className="shared-memory-empty">你也记得这一刻吗？成为第一个补充视角的人。</p> : null)}
      {pagination && pagination.page < pagination.total_pages ? <button className="text-button shared-memory-more" type="button" disabled={loading} onClick={() => void load(pagination.page + 1, true)}>{loading ? "正在读取" : "继续查看补充"}</button> : null}
    </section>
  );
}
