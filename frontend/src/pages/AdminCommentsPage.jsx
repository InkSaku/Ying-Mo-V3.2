import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminActionDialog, AdminPageFrame, AdminStatus } from "../components/AdminPanel";
import { CustomSelect } from "../components/CustomSelect";
import { EmptyState, ErrorState } from "../components/States";
import { Pagination } from "../components/Pagination";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { api } from "../lib/api";
import { adminCommentSearchParams, adminCommentsApiPath, readAdminCommentFilters } from "../lib/admin";
import { formatDate } from "../lib/format";
import { clampPageToTotal } from "../lib/pagination";

const PAGE_SIZE = 20;

export function AdminCommentsPage() {
  usePageMeta("评论管理");
  const [params, setParams] = useSearchParams();
  const filters = readAdminCommentFilters(params);
  const [postValue, setPostValue] = useState(filters.post_id);
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [message, setMessage] = useState("");
  const canonicalParams = adminCommentSearchParams(filters).toString();
  const state = useAsyncData(() => api.get(adminCommentsApiPath(filters, PAGE_SIZE)), [filters.status, filters.post_id, filters.page]);
  const pagination = state.meta?.pagination || {};
  const clampedPage = clampPageToTotal(filters.page, pagination.total || 0, pagination.page_size || PAGE_SIZE);
  const pageNeedsClamp = Boolean(state.data) && clampedPage !== filters.page;

  useEffect(() => setPostValue(filters.post_id), [filters.post_id]);
  useEffect(() => { if (params.toString() !== canonicalParams) setParams(canonicalParams, { replace: true }); }, [canonicalParams, params, setParams]);
  useEffect(() => {
    if (pageNeedsClamp) setParams(adminCommentSearchParams({ ...filters, page: clampedPage }), { replace: true });
  }, [clampedPage, filters, pageNeedsClamp, setParams]);

  const updateFilters = (updates) => setParams(adminCommentSearchParams({ ...filters, ...updates, page: updates.page || 1 }));
  const openAction = (type, item) => { setAction({ type, item }); setReason(""); setActionError(null); setMessage(""); };
  const closeAction = () => { if (!actionBusy) setAction(null); };
  const confirmAction = async () => {
    if (!action || actionBusy || !reason.trim()) return;
    setActionBusy(true); setActionError(null);
    try {
      await api.post(`/admin/comments/${action.item.id}/${action.type}`, { reason: reason.trim() });
      setMessage(`已${action.type === "hide" ? "隐藏" : "恢复"}评论 #${action.item.id}。`);
      setAction(null);
      await state.reload();
    } catch (error) { setActionError(error); }
    finally { setActionBusy(false); }
  };

  return (
    <AdminPageFrame title="评论" description="按状态或目标 Post 审阅评论。V3.2 管理端只提供隐藏与恢复；成员自行删除的评论不可恢复。" busy={state.loading || actionBusy || pageNeedsClamp} actions={<span className="personal-page-total tabular">共 {pagination.total || 0} 条</span>}>
      <form className="admin-content-filters admin-comment-filters" role="search" onSubmit={(event) => { event.preventDefault(); updateFilters({ post_id: postValue.replace(/\D/g, ""), page: 1 }); }}>
        <label className="admin-filter-search"><span>目标 Post ID</span><input inputMode="numeric" pattern="[1-9][0-9]*" value={postValue} onChange={(event) => setPostValue(event.target.value.replace(/\D/g, ""))} placeholder="例如 42" /></label>
        <label><span>状态</span><CustomSelect value={filters.status} onChange={(event) => updateFilters({ status: event.target.value, page: 1 })}><option value="">全部状态</option><option value="active">正常</option><option value="hidden">已隐藏</option><option value="deleted">成员已删除</option></CustomSelect></label>
        <button className="btn btn-secondary" type="submit" disabled={state.loading}>筛选</button>
      </form>
      {message ? <div className="inline-success admin-feedback" role="status">{message}</div> : null}
      {state.loading && !state.data ? <div className="skeleton-stack" role="status"><span className="sr-only">正在读取评论列表</span><div className="skeleton-block" /></div> : null}
      {state.error ? <ErrorState error={state.error} onRetry={state.reload} /> : null}
      {state.loading && state.data ? <div className="profile-refresh" role="status">正在更新评论列表…</div> : null}
      {pageNeedsClamp ? <div className="profile-refresh" role="status">正在返回有效页码…</div> : null}
      {state.data && !pageNeedsClamp ? state.data.length ? <div className="admin-content-list">
        {state.data.map((comment) => (
          <article className="admin-content-row admin-comment-row" key={comment.id}>
            <div className="admin-content-main">
              <div className="admin-content-title"><h2>评论 #{comment.id}</h2><AdminStatus value={comment.status} /></div>
              <blockquote>{comment.body || "（内容已清除）"}</blockquote>
              <small>作者 @{comment.author?.username || "未知"} · 用户 #{comment.author_id}</small>
              <small>目标：{comment.post ? `${comment.post.title || `${comment.post.post_type} #${comment.post.id}`} · ${comment.post.status}${comment.post.moderation_status === "hidden" ? " · 已隐藏" : ""}${comment.post.deleted_at ? " · 已删除" : ""}` : `Post #${comment.post_id}（已不存在）`}</small>
            </div>
            <dl className="admin-content-meta"><div><dt>创建</dt><dd><time dateTime={comment.created_at}>{formatDate(comment.created_at, true)}</time></dd></div><div><dt>更新</dt><dd><time dateTime={comment.updated_at}>{formatDate(comment.updated_at, true)}</time></dd></div></dl>
            <div className="admin-content-actions">
              {comment.status !== "deleted" ? <button className="btn btn-secondary btn-small" type="button" disabled={actionBusy} onClick={() => openAction(comment.status === "hidden" ? "restore" : "hide", comment)}>{comment.status === "hidden" ? "恢复" : "隐藏"}</button> : null}
            </div>
          </article>
        ))}
      </div> : <EmptyState title="没有匹配的评论" description="调整状态或目标 Post ID 后重试。" /> : null}
      <Pagination page={pagination.page || filters.page} totalPages={pagination.total_pages || 0} disabled={state.loading || actionBusy || pageNeedsClamp} onChange={(page) => updateFilters({ page })} />
      <AdminActionDialog open={Boolean(action)} title={action?.type === "hide" ? "隐藏评论" : "恢复评论"} description={action?.type === "hide" ? "隐藏后评论不会出现在普通成员的评论区。" : "恢复后评论会重新遵守目标 Post 的访问权限。"} confirmLabel={action?.type === "hide" ? "确认隐藏" : "确认恢复"} reason={reason} busy={actionBusy} error={actionError?.message} onReasonChange={setReason} onConfirm={() => { void confirmAction(); }} onClose={closeAction} />
    </AdminPageFrame>
  );
}
