import { useEffect, useId, useRef, useState } from "react";
import { api } from "../lib/api";
import { internalLinkPath, validLinkHref } from "../lib/contentLinks";

export function ContentLinkDialog({ draft, excludePostId, onApply, onRemove, onClose }) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const helpId = useId();
  const [mode, setMode] = useState(draft.href?.startsWith("#ym-h-") ? "heading" : draft.href && !internalLinkPath(draft.href)?.startsWith("/articles/") ? "address" : "article");
  const [text, setText] = useState(draft.text);
  const [href, setHref] = useState(draft.href);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [results, setResults] = useState({ rows: [], pagination: null, loading: true, error: "" });
  const [selected, setSelected] = useState(null);
  const [invalid, setInvalid] = useState(false);
  const existingArticle = internalLinkPath(draft.href)?.match(/^\/articles\/[^/?#]+\/?(?:[?#].*)?$/) ? draft.href : "";
  const [selectedHeading, setSelectedHeading] = useState(() => (draft.headings || []).find((heading) => `#${heading.id}` === draft.href) || null);
  const headings = (draft.headings || []).filter((heading) => heading.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  useEffect(() => { dialogRef.current?.querySelector("[data-link-focus]")?.focus(); }, [mode]);

  useEffect(() => {
    if (mode !== "article") return undefined;
    const controller = new AbortController();
    setResults({ rows: [], pagination: null, loading: true, error: "" });
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({ q: query.trim(), page: String(page), page_size: "8" });
      if (excludePostId) params.set("exclude", String(excludePostId));
      try {
        const result = await api.get(`/posts/link-options?${params}`, { signal: controller.signal });
        if (!controller.signal.aborted) setResults({ rows: result.data, pagination: result.meta.pagination, loading: false, error: "" });
      } catch (error) {
        if (!controller.signal.aborted) setResults({ rows: [], pagination: null, loading: false, error: error.message });
      }
    }, query ? 250 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [mode, query, page, retry, excludePostId]);

  const apply = () => {
    const destination = mode === "heading" ? (selectedHeading ? `#${selectedHeading.id}` : "") : mode === "article" ? selected?.href || existingArticle : href.trim();
    if (!validLinkHref(destination)) { setInvalid(true); return; }
    onApply({ href: internalLinkPath(destination) || destination, text: text.trim() || (mode === "heading" ? selectedHeading?.title : selected?.title) || draft.text || destination, heading: mode === "heading" ? selectedHeading : undefined });
  };

  return <dialog ref={dialogRef} className="content-link-dialog" aria-labelledby={titleId} aria-describedby={helpId}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onKeyDown={(event) => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
    }}>
    <header><h2 id={titleId}>{draft.href ? "编辑链接" : "插入链接"}</h2><button type="button" aria-label="关闭链接选择" onClick={onClose}>×</button></header>
    <div className="content-link-body">
    <p id={helpId}>{mode === "heading" ? "选一个标题，读者就能直接跳到那一节。" : "选一篇文章或本文标题，也可以填写网址。"}</p>
    <div className="content-link-modes" role="group" aria-label="链接类型">
      <button type="button" aria-pressed={mode === "article"} onClick={() => { setMode("article"); setInvalid(false); }}>站内文章</button>
      <button type="button" aria-pressed={mode === "heading"} onClick={() => { setMode("heading"); setQuery(""); setInvalid(false); }}>本文标题</button>
      <button type="button" aria-pressed={mode === "address"} onClick={() => { setMode("address"); setInvalid(false); }}>网址链接</button>
    </div>
    <label className="content-link-field">显示文字<input value={text} onChange={(event) => setText(event.target.value)} placeholder="留空时使用文章标题" /></label>
    {mode === "heading" ? <>
      {draft.headingError ? <p className="inline-error" role="alert">{draft.headingError}</p> : null}
      <label className="content-link-field">查找标题<input data-link-focus type="search" value={query} placeholder="搜索本文标题" onChange={(event) => setQuery(event.target.value)} /></label>
      <div className="content-link-results">
        <p className="content-link-status" role="status">{!(draft.headings || []).length ? "正文还没有标题，请先把章节设为标题样式。" : !headings.length ? "没有匹配的标题，试试其他关键词。" : "按正文顺序排列"}</p>
        {headings.map((heading) => <button type="button" className="content-link-result content-heading-result" key={heading.id} aria-pressed={selectedHeading?.id === heading.id} onClick={() => {
          setSelectedHeading(heading);
          setHref(`#${heading.id}`);
          if (!text.trim() || text === selectedHeading?.title || text === selected?.title) setText(heading.title);
          setInvalid(false);
        }}><strong>{heading.title}</strong><span>{heading.level} 级标题 · 正文第 {(draft.headings || []).indexOf(heading) + 1} 个标题</span></button>)}
      </div>
      {selectedHeading ? <p className="content-link-selection">跳到：{selectedHeading.title}</p> : draft.href?.startsWith("#ym-h-") ? <p className="inline-error" role="alert">原目标标题已不存在，请重新选择标题或移除链接。</p> : null}
    </> : mode === "article" ? <>
      <label className="content-link-field">查找文章<input data-link-focus type="search" maxLength={100} value={query} placeholder="搜索文章标题" onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label>
      <div className="content-link-results" aria-busy={results.loading}>
        <p className="content-link-status" role="status">{results.loading ? "正在查找…" : results.error ? "文章暂时没有加载出来。" : results.rows.length ? (query.trim() ? "匹配的文章" : "最近的文章") : "没有找到文章，试试其他标题。"}</p>
        {results.error ? <div role="alert">{results.error}<button className="text-button" type="button" onClick={() => setRetry((value) => value + 1)}>重试</button></div> : null}
        {results.rows.map((post) => <button className="content-link-result" type="button" key={post.id} aria-pressed={selected?.id === post.id} onClick={() => {
          setSelected(post);
          setHref(post.href);
          if (!text.trim() || text === selected?.title) setText(post.title);
          setInvalid(false);
        }}><strong>{post.title}</strong><span>{[post.author_name, post.collection_name || (post.visibility === "private" ? "仅自己可见" : "登录成员可见")].filter(Boolean).join(" · ")}</span></button>)}
      </div>
      {results.pagination?.total_pages > 1 ? <nav className="content-link-pagination" aria-label="文章候选分页"><button type="button" disabled={!results.pagination.has_previous} onClick={() => setPage((value) => value - 1)}>上一页</button><span>{page} / {results.pagination.total_pages}</span><button type="button" disabled={!results.pagination.has_next} onClick={() => setPage((value) => value + 1)}>下一页</button></nav> : null}
      {selected || existingArticle ? <p className="content-link-selection">已选：{selected?.title || draft.text || existingArticle}</p> : null}
      <p className="content-link-note">只列出你有权阅读的已发布或归档文章。链接不会改变阅读权限，读者仍需有权访问目标文章。</p>
    </> : <label className="content-link-field">链接地址<input data-link-focus type="text" value={href} placeholder="https://… 或站内文章地址" aria-invalid={invalid} onChange={(event) => { setHref(event.target.value); setInvalid(false); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); apply(); } }} /></label>}
    {invalid ? <p className="inline-error" role="alert">请输入有效网址或选择一篇站内文章。</p> : null}
    </div>
    <footer>{draft.href ? <button type="button" className="text-button" onClick={onRemove}>移除链接</button> : null}<div><button type="button" className="btn btn-secondary" onClick={onClose}>取消</button><button type="button" className="btn btn-primary" disabled={(mode === "article" && !selected && !existingArticle) || (mode === "heading" && !selectedHeading)} onClick={apply}>{draft.href ? "应用修改" : "插入链接"}</button></div></footer>
  </dialog>;
}
