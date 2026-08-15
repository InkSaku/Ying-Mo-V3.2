import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminPageFrame } from "../components/AdminPanel";
import { EmptyState, ErrorState } from "../components/States";
import { Pagination } from "../components/Pagination";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { adminLogSearchParams, adminLogsApiPath, readAdminLogFilters } from "../lib/admin";
import { formatDate } from "../lib/format";
import { clampPageToTotal } from "../lib/pagination";
import { api } from "../lib/api";

const PAGE_SIZE = 20;
const emptyDraft = { q: "", action: "", target_type: "", target_id: "", request_id: "", operator_id: "" };

function JsonDisclosure({ label, value }) {
  return <details><summary>{label}</summary>{value == null ? <p>没有记录</p> : <pre>{JSON.stringify(value, null, 2)}</pre>}</details>;
}

export function AdminLogsPage() {
  usePageMeta("操作日志");
  const [params, setParams] = useSearchParams();
  const filters = readAdminLogFilters(params);
  const [draft, setDraft] = useState({ ...emptyDraft, ...filters });
  const canonicalParams = adminLogSearchParams(filters).toString();
  const state = useAsyncData(() => api.get(adminLogsApiPath(filters, PAGE_SIZE)), [filters.q, filters.action, filters.target_type, filters.target_id, filters.request_id, filters.operator_id, filters.page]);
  const pagination = state.meta?.pagination || {};
  const clampedPage = clampPageToTotal(filters.page, pagination.total || 0, pagination.page_size || PAGE_SIZE);
  const pageNeedsClamp = Boolean(state.data) && clampedPage !== filters.page;

  useEffect(() => { if (params.toString() !== canonicalParams) setParams(canonicalParams, { replace: true }); }, [canonicalParams, params, setParams]);
  useEffect(() => {
    setDraft({
      q: filters.q,
      action: filters.action,
      target_type: filters.target_type,
      target_id: filters.target_id,
      request_id: filters.request_id,
      operator_id: filters.operator_id,
    });
  }, [filters.q, filters.action, filters.target_type, filters.target_id, filters.request_id, filters.operator_id]);
  useEffect(() => { if (pageNeedsClamp) setParams(adminLogSearchParams({ ...filters, page: clampedPage }), { replace: true }); }, [clampedPage, filters, pageNeedsClamp, setParams]);
  const apply = (updates) => setParams(adminLogSearchParams({ ...filters, ...updates, page: updates.page || 1 }));

  return (
    <AdminPageFrame title="操作日志" description="按操作者、动作、对象和请求 ID 追溯管理操作；修改前后数据只在独立 Admin API 中提供。" busy={state.loading || pageNeedsClamp} actions={<span className="personal-page-total tabular">共 {pagination.total || 0} 条</span>}>
      <form className="admin-log-filters" role="search" onSubmit={(event) => { event.preventDefault(); apply({ ...draft, page: 1 }); }}>
        <label className="admin-filter-search"><span>全文筛选</span><input maxLength={100} value={draft.q} onChange={(event) => setDraft({ ...draft, q: event.target.value })} placeholder="动作、对象 ID、Request ID 或原因" /></label>
        <label><span>动作</span><input maxLength={80} value={draft.action} onChange={(event) => setDraft({ ...draft, action: event.target.value })} placeholder="例如 settings.update" /></label>
        <label><span>对象类型</span><input maxLength={40} value={draft.target_type} onChange={(event) => setDraft({ ...draft, target_type: event.target.value })} placeholder="例如 featured" /></label>
        <label><span>操作者 ID</span><input inputMode="numeric" pattern="[1-9][0-9]*" value={draft.operator_id} onChange={(event) => setDraft({ ...draft, operator_id: event.target.value.replace(/\D/g, "") })} /></label>
        <details className="admin-advanced-filters"><summary>精确对象与请求筛选</summary><div><label><span>对象 ID</span><input maxLength={100} value={draft.target_id} onChange={(event) => setDraft({ ...draft, target_id: event.target.value })} /></label><label><span>Request ID</span><input maxLength={64} value={draft.request_id} onChange={(event) => setDraft({ ...draft, request_id: event.target.value })} /></label></div></details>
        <button className="btn btn-secondary" type="submit" disabled={state.loading}>筛选</button>
        <button className="text-button" type="button" disabled={state.loading} onClick={() => { setDraft(emptyDraft); setParams({}); }}>清除</button>
      </form>
      {state.loading && !state.data ? <div className="skeleton-stack" role="status"><span className="sr-only">正在读取操作日志</span><div className="skeleton-block" /></div> : null}
      {state.error ? <ErrorState error={state.error} onRetry={state.reload} /> : null}
      {state.loading && state.data ? <div className="profile-refresh" role="status">正在更新操作日志…</div> : null}
      {pageNeedsClamp ? <div className="profile-refresh" role="status">正在返回有效页码…</div> : null}
      {state.data && !pageNeedsClamp ? state.data.length ? <div className="admin-log-list">{state.data.map((item) => <article key={item.id} className="admin-log-row">
        <header><div><p className="hero-kicker">{item.target_type} · {item.target_id}</p><h2>{item.action}</h2></div><time dateTime={item.created_at}>{formatDate(item.created_at, true)}</time></header>
        <dl><div><dt>操作者</dt><dd>@{item.operator?.username || "未知"} · 用户 #{item.operator?.id || "?"}</dd></div><div><dt>Request ID</dt><dd className="admin-log-code">{item.request_id}</dd></div><div><dt>原因</dt><dd>{item.reason || "未记录"}</dd></div>{item.idempotency_key ? <div><dt>幂等键</dt><dd className="admin-log-code">{item.idempotency_key}</dd></div> : null}</dl>
        <div className="admin-log-payload"><JsonDisclosure label="修改前" value={item.before} /><JsonDisclosure label="修改后" value={item.after} /></div>
      </article>)}</div> : <EmptyState title="没有匹配的操作日志" description="调整动作、对象、操作者或请求条件后重试。" /> : null}
      <Pagination page={pagination.page || filters.page} totalPages={pagination.total_pages || 0} disabled={state.loading || pageNeedsClamp} onChange={(page) => apply({ page })} />
    </AdminPageFrame>
  );
}
