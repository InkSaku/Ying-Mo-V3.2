import { useEffect, useState } from "react";
import { CustomSelect } from "../components/CustomSelect";
import { Pagination } from "../components/Pagination";
import { PersonalNav } from "../components/PersonalNav";
import { ProtectedImage } from "../components/ProtectedImage";
import { MediaOpenButton } from "../components/MediaOpenButton";
import { EmptyState, ErrorState, PageLoader } from "../components/States";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { api } from "../lib/api";

const PAGE_SIZE = 24;

export function MyMediaPage() {
  usePageMeta("我的媒体");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("active");
  const [kind, setKind] = useState("");
  const [selected, setSelected] = useState([]);
  const [editing, setEditing] = useState(null);
  const [feedback, setFeedback] = useState({ message: "", error: "" });
  const state = useAsyncData(() => api.get(`/uploads/manage/gallery?page=${page}&page_size=${PAGE_SIZE}&status=${status}&kind=${kind}`), [kind, page, status]);
  const duplicates = useAsyncData(() => api.get("/uploads/manage/media/duplicates"), []);
  const pagination = state.meta?.pagination || {};
  useEffect(() => setSelected([]), [kind, page, status]);

  const saveAlt = async (item) => {
    try {
      await api.patch(`/uploads/manage/media/${item.manage.media_ids[0]}`, { alt_text: editing.value.trim() || null });
      setEditing(null); setFeedback({ message: "ALT 文本已保存。", error: "" }); await state.reload();
    } catch (error) { setFeedback({ message: "", error: error.message }); }
  };
  const batch = async (action) => {
    try {
      const mediaIds = (state.data || []).filter((item) => selected.includes(item.id)).flatMap((item) => item.manage.media_ids);
      await api.post("/uploads/manage/media/batch", { media_ids: mediaIds, action });
      setSelected([]); setFeedback({ message: action === "hide" ? "未绑定媒体已隐藏。" : "媒体已恢复。", error: "" });
      await Promise.all([state.reload(), duplicates.reload()]);
    } catch (error) { setFeedback({ message: "", error: error.message }); }
  };
  const downloadOriginal = async (item) => {
    try {
      const target = item.downloads?.[0];
      if (!target?.path) return;
      const result = await api.blob(target.path);
      const url = URL.createObjectURL(result.data);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = target.filename || `media-${item.id}`; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setFeedback({ message: "", error: error.message }); }
  };
  if (state.loading && !state.data) return <PageLoader label="正在读取媒体库" />;
  if (state.error) return <main className="page-shell"><ErrorState error={state.error} onRetry={state.reload} /></main>;
  return <main className="page-shell personal-page-shell media-library-page">
    <PersonalNav />
    <header className="page-heading"><div><p className="section-kicker">IMAGE ARCHIVE</p><h1>影像资料</h1><p>整理原件、补充 ALT 文本，并发现重复上传；已绑定媒体不会被批量隐藏。</p></div><div className="media-library-filters"><CustomSelect aria-label="媒体类型" value={kind} onChange={(event) => { setKind(event.target.value); setPage(1); }}><option value="">全部类型</option><option value="image">图片</option><option value="live_photo">Live Photo</option></CustomSelect><CustomSelect aria-label="媒体状态" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="active">正常</option><option value="hidden">已隐藏</option><option value="all">全部</option></CustomSelect></div></header>
    {duplicates.data?.length ? <div className="inline-success" role="status">发现 {duplicates.data.length} 组重复文件，可根据文件名和绑定状态人工整理。</div> : null}
    {feedback.error ? <div className="inline-error" role="alert">{feedback.error}</div> : null}{feedback.message ? <div className="inline-success" role="status">{feedback.message}</div> : null}
    {selected.length ? <div className="media-batch-bar"><span>已选择 {selected.length} 项</span><button className="btn btn-secondary" type="button" onClick={() => { void batch(status === "hidden" ? "restore" : "hide"); }}>{status === "hidden" ? "批量恢复" : "批量隐藏未绑定媒体"}</button></div> : null}
    {state.data?.length ? <div className="media-library-grid">{state.data.map((item) => <article key={item.id} className="media-library-card"><label className="media-library-select"><input type="checkbox" checked={selected.includes(item.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /><span className="sr-only">选择媒体 {item.id}</span></label><MediaOpenButton item={item} items={state.data} context="my-media" pagination={{ page: pagination.page || page, pageSize: pagination.page_size || PAGE_SIZE, total: pagination.total || state.data.length, totalPages: pagination.total_pages || 1, loadPage: async (nextPage) => { const result = await api.get(`/uploads/manage/gallery?page=${nextPage}&page_size=${PAGE_SIZE}&status=${status}&kind=${kind}`); return { items: result.data || [] }; } }}><ProtectedImage path={item.image.manage_thumbnail_path || item.image.thumbnail_path} alt={item.image.alt_text || ""} /></MediaOpenButton><div><strong>{item.image.original_filename || `媒体 ${item.id}`}</strong><small>{item.kind === "live_photo" ? "Live Photo" : item.image.mime_type} · {(item.image.byte_size / 1024 / 1024).toFixed(2)} MB</small><small>{item.manage.bound_type ? `已绑定 ${item.manage.bound_type} #${item.manage.bound_id}` : "未绑定"}</small></div>{editing?.id === item.id ? <div className="media-alt-editor"><input maxLength={300} value={editing.value} onChange={(event) => setEditing({ id: item.id, value: event.target.value })} /><button className="text-button" type="button" onClick={() => { void saveAlt(item); }}>保存</button></div> : <button className="text-button" type="button" onClick={() => setEditing({ id: item.id, value: item.manage.alt_text || "" })}>{item.manage.alt_text ? "编辑 ALT" : "添加 ALT"}</button>}<button className="text-button" type="button" onClick={() => { void downloadOriginal(item); }}>下载原件</button></article>)}</div> : <EmptyState title="媒体库为空" />}
    <Pagination page={pagination.page || page} totalPages={pagination.total_pages || 0} onChange={setPage} />
  </main>;
}
