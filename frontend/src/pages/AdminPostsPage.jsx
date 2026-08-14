import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminActionDialog, AdminPageFrame, AdminStatus } from "../components/AdminPanel";
import { EmptyState, ErrorState } from "../components/States";
import { Pagination } from "../components/Pagination";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { api } from "../lib/api";
import { adminPostSearchParams, adminPostsApiPath, readAdminPostFilters } from "../lib/admin";
import { formatDate } from "../lib/format";
import { clampPageToTotal } from "../lib/pagination";

const PAGE_SIZE = 20;
const actionCopy = {
  hide: ["隐藏 Post", "隐藏后普通成员将无法访问该内容。", "确认隐藏"],
  restore: ["恢复 Post", "恢复后仍会继续遵守发布状态、可见性和成员权限。", "确认恢复"],
  delete: ["删除 Post", "该操作会软删除 Post，之后不能从管理页恢复。", "确认删除"],
};

function PostFilters({ filters, searchValue, loading, onSearchValue, onChange, onSubmit }) {
  return (
    <form className="admin-content-filters" role="search" onSubmit={onSubmit}>
      <label className="admin-filter-search"><span>搜索内容</span><input type="search" maxLength={100} value={searchValue} onChange={(event) => onSearchValue(event.target.value)} placeholder="标题、摘要或正文" /></label>
      <label><span>类型</span><select value={filters.post_type} onChange={(event) => onChange({ post_type: event.target.value })}><option value="">全部类型</option><option value="article">Article</option><option value="note">Note</option></select></label>
      <label><span>发布状态</span><select value={filters.status} onChange={(event) => onChange({ status: event.target.value })}><option value="">全部状态</option><option value="draft">草稿</option><option value="published">已发布</option><option value="archived">已归档</option></select></label>
      <label><span>可见性</span><select value={filters.visibility} onChange={(event) => onChange({ visibility: event.target.value })}><option value="">全部可见性</option><option value="login_only">成员可见</option><option value="private">仅作者</option></select></label>
      <label><span>治理状态</span><select value={filters.moderation_status} onChange={(event) => onChange({ moderation_status: event.target.value })}><option value="">全部治理状态</option><option value="active">正常</option><option value="hidden">已隐藏</option></select></label>
      <button className="btn btn-secondary" type="submit" disabled={loading}>搜索</button>
      <details className="admin-advanced-filters">
        <summary>按关联 ID 筛选</summary>
        <div>
          {[["author_id", "作者 ID"], ["category_id", "分类 ID"], ["tag_id", "标签 ID"], ["collection_id", "Collection ID"]].map(([key, label]) => (
            <label key={key}><span>{label}</span><input inputMode="numeric" pattern="[1-9][0-9]*" value={filters[key]} onChange={(event) => onChange({ [key]: event.target.value.replace(/\D/g, "") })} /></label>
          ))}
        </div>
      </details>
    </form>
  );
}

export function AdminPostsPage() {
  usePageMeta("Post 管理");
  const [params, setParams] = useSearchParams();
  const filters = readAdminPostFilters(params);
  const [searchValue, setSearchValue] = useState(filters.q);
  const [preview, setPreview] = useState({ id: null, data: null, loading: false, error: null });
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [message, setMessage] = useState("");
  const canonicalParams = adminPostSearchParams(filters).toString();
  const state = useAsyncData(() => api.get(adminPostsApiPath(filters, PAGE_SIZE)), Object.values(filters));
  const pagination = state.meta?.pagination || {};
  const clampedPage = clampPageToTotal(filters.page, pagination.total || 0, pagination.page_size || PAGE_SIZE);
  const pageNeedsClamp = Boolean(state.data) && clampedPage !== filters.page;

  useEffect(() => setSearchValue(filters.q), [filters.q]);
  useEffect(() => { if (params.toString() !== canonicalParams) setParams(canonicalParams, { replace: true }); }, [canonicalParams, params, setParams]);
  useEffect(() => {
    if (pageNeedsClamp) setParams(adminPostSearchParams({ ...filters, page: clampedPage }), { replace: true });
  }, [clampedPage, filters, pageNeedsClamp, setParams]);

  const updateFilters = (updates) => setParams(adminPostSearchParams({ ...filters, ...updates, page: updates.page || 1 }));
  const submitSearch = (event) => { event.preventDefault(); updateFilters({ q: searchValue.trim(), page: 1 }); };

  const openPreview = async (postId) => {
    if (preview.id === postId && preview.data) { setPreview({ id: null, data: null, loading: false, error: null }); return; }
    setPreview({ id: postId, data: null, loading: true, error: null });
    try {
      const result = await api.get(`/admin/posts/${postId}`);
      setPreview({ id: postId, data: result.data, loading: false, error: null });
    } catch (error) {
      setPreview({ id: postId, data: null, loading: false, error });
    }
  };

  const openAction = (type, item) => { setAction({ type, item }); setReason(""); setActionError(null); setMessage(""); };
  const closeAction = () => { if (!actionBusy) setAction(null); };
  const confirmAction = async () => {
    if (!action || actionBusy || !reason.trim()) return;
    setActionBusy(true); setActionError(null);
    try {
      const path = `/admin/posts/${action.item.id}${action.type === "delete" ? "" : `/${action.type}`}`;
      if (action.type === "delete") await api.delete(path, { body: { reason: reason.trim() } });
      else await api.post(path, { reason: reason.trim() });
      const verb = action.type === "hide" ? "隐藏" : action.type === "restore" ? "恢复" : "删除";
      setMessage(`已${verb}「${action.item.title || `Note #${action.item.id}`}」。`);
      setAction(null); setPreview({ id: null, data: null, loading: false, error: null });
      await state.reload();
    } catch (error) { setActionError(error); }
    finally { setActionBusy(false); }
  };

  return (
    <AdminPageFrame title="Post" description="检索所有发布状态和可见性的内容；预览会写入审计日志，治理操作不会改写作者或 ACL。" busy={state.loading || actionBusy || pageNeedsClamp} actions={<span className="personal-page-total tabular">共 {pagination.total || 0} 条</span>}>
      <PostFilters filters={filters} searchValue={searchValue} loading={state.loading} onSearchValue={setSearchValue} onChange={(updates) => updateFilters({ ...updates, page: 1 })} onSubmit={submitSearch} />
      {message ? <div className="inline-success admin-feedback" role="status">{message}</div> : null}
      {state.loading && !state.data ? <div className="skeleton-stack" role="status"><span className="sr-only">正在读取 Post 列表</span><div className="skeleton-block" /></div> : null}
      {state.error ? <ErrorState error={state.error} onRetry={state.reload} /> : null}
      {state.loading && state.data ? <div className="profile-refresh" role="status">正在更新 Post 列表…</div> : null}
      {pageNeedsClamp ? <div className="profile-refresh" role="status">正在返回有效页码…</div> : null}
      {state.data && !pageNeedsClamp ? state.data.length ? (
        <div className="admin-content-list">
          {state.data.map((post) => (
            <article className="admin-content-row" key={post.id}>
              <div className="admin-content-main">
                <div className="admin-content-title"><h2>{post.title || `Note #${post.id}`}</h2><span className="tabular">#{post.id}</span></div>
                <div className="admin-user-badges"><AdminStatus value={post.post_type} /><AdminStatus value={post.status} /><AdminStatus value={post.visibility} /><AdminStatus value={post.deleted_at ? "deleted" : post.moderation_status} /></div>
                <p>{post.summary || "无摘要"}</p>
                <small>作者 @{post.author?.username || "未知"}{post.collection_id ? ` · Collection #${post.collection_id}` : ""}</small>
                <small>{post.category ? `分类：${post.category.name}` : "未分类"}{post.tags?.length ? ` · 标签：${post.tags.map((tag) => tag.name).join("、")}` : ""}</small>
              </div>
              <dl className="admin-content-meta"><div><dt>更新</dt><dd><time dateTime={post.updated_at}>{formatDate(post.updated_at, true)}</time></dd></div><div><dt>发布时间</dt><dd>{post.published_at ? <time dateTime={post.published_at}>{formatDate(post.published_at, true)}</time> : "尚未发布"}</dd></div></dl>
              <div className="admin-content-actions">
                <button className="btn btn-secondary btn-small" type="button" aria-expanded={preview.id === post.id} disabled={preview.loading && preview.id === post.id} onClick={() => { void openPreview(post.id); }}>{preview.loading && preview.id === post.id ? "读取中…" : preview.id === post.id ? "收起预览" : "审计预览"}</button>
                {!post.deleted_at ? <button className="btn btn-secondary btn-small" type="button" disabled={actionBusy} onClick={() => openAction(post.moderation_status === "hidden" ? "restore" : "hide", post)}>{post.moderation_status === "hidden" ? "恢复" : "隐藏"}</button> : null}
                {!post.deleted_at ? <button className="btn btn-danger btn-small" type="button" disabled={actionBusy} onClick={() => openAction("delete", post)}>删除</button> : null}
              </div>
              {preview.id === post.id ? <div className="admin-post-preview" aria-live="polite">
                {preview.error ? <ErrorState error={preview.error} onRetry={() => { void openPreview(post.id); }} /> : null}
                {preview.data ? <><h3>审计预览</h3>{preview.data.rendered_html ? <div className="prose" dangerouslySetInnerHTML={{ __html: preview.data.rendered_html }} /> : <p className="muted">正文为空</p>}</> : null}
              </div> : null}
            </article>
          ))}
        </div>
      ) : <EmptyState title="没有匹配的 Post" description="调整搜索词或筛选条件后重试。" /> : null}
      <Pagination page={pagination.page || filters.page} totalPages={pagination.total_pages || 0} disabled={state.loading || actionBusy || pageNeedsClamp} onChange={(page) => updateFilters({ page })} />
      <AdminActionDialog open={Boolean(action)} title={action ? actionCopy[action.type][0] : ""} description={action ? actionCopy[action.type][1] : ""} confirmLabel={action ? actionCopy[action.type][2] : "确认"} reason={reason} busy={actionBusy} error={actionError?.message} onReasonChange={setReason} onConfirm={() => { void confirmAction(); }} onClose={closeAction} />
    </AdminPageFrame>
  );
}
