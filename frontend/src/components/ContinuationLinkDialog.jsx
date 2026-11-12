import { useEffect, useId, useRef, useState } from "react";
import { api } from "../lib/api";
import { lockPageScroll } from "../lib/dialog";
import { continuationGapLabel, continuationLabel } from "../lib/continuations";
import { formatDate, postTypeLabel } from "../lib/format";
import "../styles/content-link-dialog.css";

const PAGE_SIZE = 8;
const EMPTY = { rows: [], pagination: null, loading: true, error: "" };

const HELP = {
  earlier: "选一篇更早写的，这篇就接着它写。",
  later: "选一篇更晚写的，它就接着这篇写。",
};

// 两篇都已经发布，事后接成一串：早发的是来源，方向由发布时间决定，不用作者再选。
export function ContinuationLinkDialog({ post, onChange, onDone, onClose }) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const helpId = useId();
  const source = post.continuation?.source || null;
  const [direction, setDirection] = useState(source ? "later" : "earlier");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [results, setResults] = useState(EMPTY);
  const [selected, setSelected] = useState(null);
  const [widen, setWiden] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const blocked = direction === "earlier" && Boolean(source);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    const unlock = lockPageScroll();
    return () => { dialog.close(); unlock(); };
  }, []);

  useEffect(() => { dialogRef.current?.querySelector("[data-link-focus]")?.focus(); }, [direction, blocked]);

  useEffect(() => {
    if (blocked) return undefined;
    const controller = new AbortController();
    setResults(EMPTY);
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({ direction, q: query.trim(), page: String(page), page_size: String(PAGE_SIZE) });
      try {
        const result = await api.get(`/posts/${post.id}/continuation-candidates?${params}`, { signal: controller.signal });
        if (!controller.signal.aborted) setResults({ rows: result.data, pagination: result.meta.pagination, loading: false, error: "" });
      } catch (loadError) {
        if (!controller.signal.aborted) setResults({ rows: [], pagination: null, loading: false, error: loadError.message });
      }
    }, query ? 250 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [post.id, blocked, direction, query, page, retry]);

  const switchTo = (next) => {
    if (next === direction) return;
    setDirection(next);
    setQuery("");
    setPage(1);
    setSelected(null);
    setWiden(null);
    setError("");
    setNotice("");
  };

  const gapTo = (item) => direction === "earlier"
    ? continuationGapLabel(item.published_at, post.published_at)
    : continuationGapLabel(post.published_at, item.published_at);

  const link = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.post(`/posts/${post.id}/continuation-links`, {
        target_post_id: selected.id,
        ...(widen ? { confirm_widen_chain: true } : {}),
      });
      onChange(result.data);
      const name = continuationLabel(selected);
      onDone(direction === "earlier" ? `已接上：这篇接着《${name}》写。` : `已接上：《${name}》接着这篇写。`);
    } catch (linkError) {
      if (linkError.code === "CONTINUATION_WIDEN_CONFIRM") setWiden(linkError.details?.posts || []);
      else setError(linkError.message);
      setBusy(false);
    }
  };

  const unlink = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.delete(`/posts/${post.id}/continuation-link`);
      onChange(result.data);
      setNotice("已取消接续，阅读范围没有变。现在可以另选一篇。");
    } catch (unlinkError) {
      setError(unlinkError.message);
    } finally {
      setBusy(false);
    }
  };

  const status = results.loading
    ? "正在查找…"
    : results.error
      ? "记录暂时没有加载出来。"
      : results.rows.length
        ? (query.trim() ? "匹配的记录" : direction === "earlier" ? "由近到远：这篇之前写的" : "由近到远：这篇之后写的")
        : query.trim() ? "没有匹配的记录，试试其他关键词。" : direction === "earlier" ? "这篇之前没有可以接上的记录。" : "这篇之后没有可以接上的记录。";

  return <dialog ref={dialogRef} className="content-link-dialog continuation-link-dialog" aria-labelledby={titleId} aria-describedby={helpId}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onKeyDown={(event) => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
    }}>
    <header><h2 id={titleId}>接上已有的</h2><button type="button" aria-label="关闭接上已有的" onClick={onClose}>×</button></header>
    <div className="content-link-body">
      <p id={helpId}>{blocked ? "每篇只能接着一篇写。" : HELP[direction]}</p>
      <div className="content-link-modes" role="group" aria-label="接在前面还是后面">
        <button type="button" aria-pressed={direction === "earlier"} onClick={() => switchTo("earlier")}>之前写的</button>
        <button type="button" aria-pressed={direction === "later"} onClick={() => switchTo("later")}>之后写的</button>
      </div>
      <p className="continuation-link-notice" role="status">{notice}</p>

      {blocked ? <div className="continuation-link-current">
        <p>{source.state === "available" ? <>这篇现在接着《{continuationLabel(source)}》写。</> : "这篇接着的记录已不在。"}要换一篇，先取消接续。</p>
        <button className="text-button" type="button" disabled={busy} onClick={() => void unlink()}>{busy ? "正在取消…" : "取消接续"}</button>
        <small>取消后两篇各自独立；已经变成所有映墨成员可读的内容不会自动改回。</small>
      </div> : <>
        <label className="content-link-field">查找<input data-link-focus type="search" maxLength={100} value={query} placeholder="搜索标题或正文" onChange={(event) => { setQuery(event.target.value); setPage(1); setSelected(null); setWiden(null); setError(""); }} /></label>
        <div className="content-link-results" aria-busy={results.loading}>
          <p className="content-link-status" role="status">{status}</p>
          {results.error ? <div role="alert">{results.error}<button className="text-button" type="button" onClick={() => setRetry((value) => value + 1)}>重试</button></div> : null}
          {results.rows.map((item) => {
            const taken = item.continues;
            const facts = [postTypeLabel(item.post_type), formatDate(item.published_at), gapTo(item), item.visibility === "private" ? "仅自己可见" : ""].filter(Boolean).join(" · ");
            return <button className="content-link-result" type="button" key={item.id} disabled={Boolean(taken)} aria-pressed={selected?.id === item.id} onClick={() => {
              setSelected(item);
              setWiden(null);
              setError("");
              setNotice("");
            }}>
              <strong>{continuationLabel(item)}</strong>
              <span>{facts}</span>
              {taken ? <span className="continuation-link-taken">{taken.state === "available" ? `已经接着《${continuationLabel(taken)}》写` : "已经接着别的记录写"}</span> : null}
            </button>;
          })}
        </div>
        {results.pagination?.total_pages > 1 ? <nav className="content-link-pagination" aria-label="候选分页"><button type="button" disabled={!results.pagination.has_previous} onClick={() => setPage((value) => value - 1)}>上一页</button><span>{page} / {results.pagination.total_pages}</span><button type="button" disabled={!results.pagination.has_next} onClick={() => setPage((value) => value + 1)}>下一页</button></nav> : null}
        {selected ? <p className="content-link-selection">接上后：{direction === "earlier" ? <>这篇接着《{continuationLabel(selected)}》写</> : <>《{continuationLabel(selected)}》接着这篇写</>}{gapTo(selected) ? ` · ${gapTo(selected)}` : ""}</p> : null}
        {widen ? <div className="publish-chain-notice" role="alert">接上后，下面的内容也会变成所有映墨成员可读：<ul>{widen.map((item) => <li key={item.id}>《{continuationLabel(item)}》</li>)}</ul></div> : null}
        <p className="content-link-note">只列出你发布过、和这篇在同一个地方的记录：同一个合集里，或都不在合集里。</p>
      </>}
      {error ? <p className="inline-error" role="alert">{error}</p> : null}
    </div>
    <footer><div>
      <button type="button" className="btn btn-secondary" onClick={onClose}>{blocked ? "关闭" : "取消"}</button>
      {blocked ? null : <button type="button" className="btn btn-primary" disabled={!selected || busy} aria-busy={busy || undefined} onClick={() => void link()}>{busy ? "正在接上…" : widen ? "确认接上" : "接上"}</button>}
    </div></footer>
  </dialog>;
}
