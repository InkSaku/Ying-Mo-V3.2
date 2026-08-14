import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminActionDialog, AdminPageFrame, AdminStatus } from "../components/AdminPanel";
import { EmptyState, ErrorState } from "../components/States";
import { Pagination } from "../components/Pagination";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { api } from "../lib/api";
import { adminCollectionSearchParams, adminCollectionsApiPath, readAdminCollectionFilters } from "../lib/admin";
import { formatDate } from "../lib/format";
import { clampPageToTotal } from "../lib/pagination";

const PAGE_SIZE = 20;
const actionCopy = {
  hide: ["隐藏 Collection", "隐藏后 Collection 及其中内容会按后端 ACL 对普通成员收口。", "确认隐藏"],
  restore: ["恢复 Collection", "恢复后其中内容仍分别遵守自身发布状态、可见性和治理状态。", "确认恢复"],
  delete: ["删除 Collection", "Collection 将被删除，其中的 Post 会解除归属并转为仅作者可见。", "确认删除"],
};

export function AdminCollectionsPage() {
  usePageMeta("Collection 管理");
  const [params, setParams] = useSearchParams();
  const filters = readAdminCollectionFilters(params);
  const [searchValue, setSearchValue] = useState(filters.q);
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [message, setMessage] = useState("");
  const canonicalParams = adminCollectionSearchParams(filters).toString();
  const state = useAsyncData(() => api.get(adminCollectionsApiPath(filters, PAGE_SIZE)), [filters.q, filters.status, filters.page]);
  const pagination = state.meta?.pagination || {};
  const clampedPage = clampPageToTotal(filters.page, pagination.total || 0, pagination.page_size || PAGE_SIZE);
  const pageNeedsClamp = Boolean(state.data) && clampedPage !== filters.page;

  useEffect(() => setSearchValue(filters.q), [filters.q]);
  useEffect(() => { if (params.toString() !== canonicalParams) setParams(canonicalParams, { replace: true }); }, [canonicalParams, params, setParams]);
  useEffect(() => {
    if (pageNeedsClamp) setParams(adminCollectionSearchParams({ ...filters, page: clampedPage }), { replace: true });
  }, [clampedPage, filters, pageNeedsClamp, setParams]);

  const updateFilters = (updates) => setParams(adminCollectionSearchParams({ ...filters, ...updates, page: updates.page || 1 }));
  const openAction = (type, item) => { setAction({ type, item }); setReason(""); setActionError(null); setMessage(""); };
  const closeAction = () => { if (!actionBusy) setAction(null); };
  const confirmAction = async () => {
    if (!action || actionBusy || !reason.trim()) return;
    setActionBusy(true); setActionError(null);
    try {
      const path = `/admin/collections/${action.item.id}${action.type === "delete" ? "" : `/${action.type}`}`;
      const result = action.type === "delete"
        ? await api.delete(path, { body: { reason: reason.trim() } })
        : await api.post(path, { reason: reason.trim() });
      const verb = action.type === "hide" ? "隐藏" : action.type === "restore" ? "恢复" : "删除";
      const suffix = action.type === "delete" ? `（${result.data?.mode === "physical" ? "物理删除" : "软删除"}）` : "";
      setMessage(`已${verb}「${action.item.name}」${suffix}。`);
      const shouldStepBack = action.type === "delete" && result.data?.mode === "physical" && state.data?.length === 1 && filters.page > 1;
      setAction(null);
      if (shouldStepBack) setParams(adminCollectionSearchParams({ ...filters, page: filters.page - 1 }), { replace: true });
      else await state.reload();
    } catch (error) { setActionError(error); }
    finally { setActionBusy(false); }
  };

  return (
    <AdminPageFrame title="Collection" description="查看创建者、成员和内容规模；治理操作由后端统一执行成员访问收口与 Post 脱离。" busy={state.loading || actionBusy || pageNeedsClamp} actions={<span className="personal-page-total tabular">共 {pagination.total || 0} 个</span>}>
      <form className="admin-content-filters admin-collection-filters" role="search" onSubmit={(event) => { event.preventDefault(); updateFilters({ q: searchValue.trim(), page: 1 }); }}>
        <label className="admin-filter-search"><span>搜索 Collection</span><input type="search" maxLength={100} value={searchValue} onChange={(event) => setSearchValue(event.target.value)} placeholder="名称或 slug" /></label>
        <label><span>状态</span><select value={filters.status} onChange={(event) => updateFilters({ status: event.target.value, page: 1 })}><option value="">全部状态</option><option value="active">正常</option><option value="hidden">已隐藏</option></select></label>
        <button className="btn btn-secondary" type="submit" disabled={state.loading}>搜索</button>
      </form>
      {message ? <div className="inline-success admin-feedback" role="status">{message}</div> : null}
      {state.loading && !state.data ? <div className="skeleton-stack" role="status"><span className="sr-only">正在读取 Collection 列表</span><div className="skeleton-block" /></div> : null}
      {state.error ? <ErrorState error={state.error} onRetry={state.reload} /> : null}
      {state.loading && state.data ? <div className="profile-refresh" role="status">正在更新 Collection 列表…</div> : null}
      {pageNeedsClamp ? <div className="profile-refresh" role="status">正在返回有效页码…</div> : null}
      {state.data && !pageNeedsClamp ? state.data.length ? <div className="admin-content-list">
        {state.data.map((collection) => (
          <article className="admin-content-row" key={collection.id}>
            <div className="admin-content-main">
              <div className="admin-content-title"><h2>{collection.name}</h2><span className="tabular">#{collection.id}</span></div>
              <div className="admin-user-badges"><AdminStatus value={collection.deleted_at ? "deleted" : collection.status} /></div>
              <p>{collection.description || "无简介"}</p>
              <small>创建者 @{collection.creator?.username || "未知"} · /collections/{collection.slug}</small>
              <small>成员：{collection.members?.length ? collection.members.map((member) => `@${member.username}`).join("、") : "无"}</small>
            </div>
            <dl className="admin-content-meta"><div><dt>Post</dt><dd className="admin-content-count tabular">{collection.post_count || 0}</dd></div><div><dt>成员</dt><dd className="tabular">{collection.members?.length || 0}</dd></div><div><dt>更新</dt><dd><time dateTime={collection.updated_at}>{formatDate(collection.updated_at, true)}</time></dd></div></dl>
            <div className="admin-content-actions">
              {!collection.deleted_at ? <button className="btn btn-secondary btn-small" type="button" disabled={actionBusy} onClick={() => openAction(collection.status === "hidden" ? "restore" : "hide", collection)}>{collection.status === "hidden" ? "恢复" : "隐藏"}</button> : null}
              {!collection.deleted_at ? <button className="btn btn-danger btn-small" type="button" disabled={actionBusy} onClick={() => openAction("delete", collection)}>删除</button> : null}
            </div>
          </article>
        ))}
      </div> : <EmptyState title="没有匹配的 Collection" description="调整名称或状态筛选后重试。" /> : null}
      <Pagination page={pagination.page || filters.page} totalPages={pagination.total_pages || 0} disabled={state.loading || actionBusy || pageNeedsClamp} onChange={(page) => updateFilters({ page })} />
      <AdminActionDialog open={Boolean(action)} title={action ? actionCopy[action.type][0] : ""} description={action ? actionCopy[action.type][1] : ""} confirmLabel={action ? actionCopy[action.type][2] : "确认"} reason={reason} busy={actionBusy} error={actionError?.message} onReasonChange={setReason} onConfirm={() => { void confirmAction(); }} onClose={closeAction} />
    </AdminPageFrame>
  );
}
