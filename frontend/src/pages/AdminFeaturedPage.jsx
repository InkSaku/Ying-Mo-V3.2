import { useState } from "react";
import { AdminActionDialog, AdminPageFrame } from "../components/AdminPanel";
import { CustomSelect } from "../components/CustomSelect";
import { EmptyState, ErrorState } from "../components/States";
import { Pagination } from "../components/Pagination";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { api } from "../lib/api";
import { adminFeaturedCandidatesApiPath } from "../lib/admin";
import { formatDate } from "../lib/format";

const CANDIDATE_PAGE_SIZE = 8;

function targetLabel(item) {
  if (!item.target) return `${item.content_type === "article" ? "Article" : "Collection"} 目标不存在`;
  return item.content_type === "article"
    ? item.target.title || `Article #${item.post_id}`
    : item.target.name || `Collection #${item.collection_id}`;
}

function suggestedSortOrder(items, contentType) {
  const values = (items || [])
    .filter((item) => item.content_type === contentType)
    .map((item) => Number(item.sort_order))
    .filter(Number.isFinite);
  return values.length ? Math.max(...values) + 10 : 0;
}

function candidateTitle(item) {
  return item.content_type === "article" ? item.title : item.name;
}

export function AdminFeaturedPage() {
  usePageMeta("首页精选");
  const state = useAsyncData(() => api.get("/admin/featured"), []);
  const [action, setAction] = useState(null);
  const [draft, setDraft] = useState({ content_type: "article", target_id: "", sort_order: "0" });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [message, setMessage] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidateQuery, setCandidateQuery] = useState("");
  const [candidatePage, setCandidatePage] = useState(1);
  const candidateState = useAsyncData(
    () => action?.type === "create"
      ? api.get(adminFeaturedCandidatesApiPath({
          contentType: draft.content_type,
          q: candidateQuery,
          page: candidatePage,
        }, CANDIDATE_PAGE_SIZE))
      : Promise.resolve({ data: [], meta: null }),
    [action?.type, draft.content_type, candidateQuery, candidatePage],
  );

  const openAction = (type, item = null) => {
    setAction({ type, item });
    setReason(""); setActionError(null); setMessage("");
    setCandidateSearch(""); setCandidateQuery(""); setCandidatePage(1);
    setDraft(item ? {
      content_type: item.content_type,
      target_id: String(item.post_id || item.collection_id || ""),
      sort_order: String(item.sort_order),
    } : {
      content_type: "article",
      target_id: "",
      sort_order: String(suggestedSortOrder(state.data, "article")),
    });
  };
  const closeAction = () => { if (!busy) setAction(null); };
  const targetId = Number(draft.target_id);
  const sortOrder = Number(draft.sort_order);
  const draftInvalid = !Number.isInteger(sortOrder) || (action?.type === "create" && (!Number.isInteger(targetId) || targetId <= 0));

  const confirmAction = async () => {
    if (!action || busy || !reason.trim() || draftInvalid) return;
    setBusy(true); setActionError(null);
    try {
      if (action.type === "create") {
        await api.post("/admin/featured", {
          content_type: draft.content_type,
          post_id: draft.content_type === "article" ? targetId : null,
          collection_id: draft.content_type === "collection" ? targetId : null,
          sort_order: sortOrder,
          reason: reason.trim(),
        });
        setMessage("精选项已添加；首页仍会按当前成员 ACL 决定是否展示。");
      } else if (action.type === "order") {
        await api.patch(`/admin/featured/${action.item.id}`, { sort_order: sortOrder, reason: reason.trim() });
        setMessage(`精选项 #${action.item.id} 的排序已保存。`);
      } else if (action.type === "toggle") {
        await api.patch(`/admin/featured/${action.item.id}`, { is_active: !action.item.is_active, reason: reason.trim() });
        setMessage(`精选项 #${action.item.id} 已${action.item.is_active ? "停用" : "启用"}。`);
      } else {
        await api.delete(`/admin/featured/${action.item.id}`, { body: { reason: reason.trim() } });
        setMessage(`精选项 #${action.item.id} 已删除。`);
      }
      setAction(null);
      await state.reload();
    } catch (error) {
      setActionError(error);
    } finally {
      setBusy(false);
    }
  };

  const titles = {
    create: "添加首页精选", order: "调整精选排序", toggle: action?.item?.is_active ? "停用精选项" : "启用精选项", delete: "删除精选项",
  };
  const descriptions = {
    create: "搜索并星标内容即可，不需要查找数据库 ID。这里只会列出当前可加入精选的内容。",
    order: "数值越小越靠前；Article 与 Collection 分别在各自首页区块中排序。",
    toggle: action?.item?.is_active ? "停用后立即退出首页精选结果，但保留配置记录。" : "重新启用前，后端会再次校验目标是否仍可用。",
    delete: "删除只移除精选配置，不会删除 Article 或 Collection。",
  };
  const candidatePagination = candidateState.meta?.pagination || {};
  const candidates = (candidateState.data || []).filter((item) => item.content_type === draft.content_type);

  const changeContentType = (contentType) => {
    setDraft({
      content_type: contentType,
      target_id: "",
      sort_order: String(suggestedSortOrder(state.data, contentType)),
    });
    setCandidateSearch(""); setCandidateQuery(""); setCandidatePage(1);
  };

  return (
    <AdminPageFrame title="首页精选" description="配置 Article 与 Collection 的首页顺序和启用状态。首页查询会再次应用每位成员的真实 ACL。" busy={state.loading || busy} actions={<button className="btn btn-primary" type="button" disabled={state.loading || busy} onClick={() => openAction("create")}>添加精选</button>}>
      {message ? <div className="inline-success admin-feedback" role="status">{message}</div> : null}
      {state.loading && !state.data ? <div className="skeleton-stack" role="status"><span className="sr-only">正在读取首页精选</span><div className="skeleton-block" /></div> : null}
      {state.error ? <ErrorState error={state.error} onRetry={state.reload} /> : null}
      {state.loading && state.data ? <div className="profile-refresh" role="status">正在更新精选列表…</div> : null}
      {state.data ? state.data.length ? <div className="admin-content-list">
        {state.data.map((item) => (
          <article className="admin-content-row admin-featured-row" key={item.id}>
            <div className="admin-content-main">
              <div className="admin-content-title"><h2>{targetLabel(item)}</h2><span className={`admin-status admin-status-${item.is_active ? "active" : "inactive"}`}>{item.is_active ? "已启用" : "已停用"}</span>{!item.eligible ? <span className="admin-status admin-status-hidden">目标不可用</span> : null}</div>
              <small>{item.content_type === "article" ? `Article #${item.post_id}` : `Collection #${item.collection_id}`}</small>
              {item.content_type === "article" ? <small>作者 @{item.target?.author?.username || "未知"} · {item.target?.status || "不存在"} · {item.target?.moderation_status || "未知治理状态"} · {item.target?.visibility === "private" ? "仅作者" : "成员可见"}</small> : <small>创建者 @{item.target?.creator?.username || "未知"} · {item.target?.status || "不存在"}</small>}
              <small>配置人 @{item.created_by?.username || "未知"}</small>
            </div>
            <dl className="admin-content-meta"><div><dt>排序</dt><dd className="admin-content-count tabular">{item.sort_order}</dd></div><div><dt>更新</dt><dd><time dateTime={item.updated_at}>{formatDate(item.updated_at, true)}</time></dd></div></dl>
            <div className="admin-content-actions">
              <button className="btn btn-secondary btn-small" type="button" disabled={busy} onClick={() => openAction("order", item)}>调整排序</button>
              <button className="btn btn-secondary btn-small" type="button" disabled={busy || (!item.is_active && !item.eligible)} title={!item.is_active && !item.eligible ? "目标当前不可用，不能启用" : undefined} onClick={() => openAction("toggle", item)}>{item.is_active ? "停用" : "启用"}</button>
              <button className="btn btn-danger btn-small" type="button" disabled={busy} onClick={() => openAction("delete", item)}>删除</button>
            </div>
          </article>
        ))}
      </div> : <EmptyState title="还没有首页精选" description="添加 Article 或 Collection 后，符合当前成员 ACL 的目标会出现在首页。" /> : null}

      <AdminActionDialog open={Boolean(action)} title={titles[action?.type]} description={descriptions[action?.type]} confirmLabel={action?.type === "delete" ? "确认删除" : action?.type === "toggle" ? (action.item.is_active ? "确认停用" : "确认启用") : action?.type === "create" ? "添加到精选" : "保存排序"} reason={reason} busy={busy} error={actionError?.message} danger={action?.type === "delete"} wide={action?.type === "create"} confirmDisabled={draftInvalid} onReasonChange={setReason} onConfirm={() => { void confirmAction(); }} onClose={closeAction}>
        {action?.type === "create" ? <div className="admin-featured-picker">
          <label className="admin-featured-type"><span>内容类型</span><CustomSelect value={draft.content_type} disabled={busy} onChange={(event) => changeContentType(event.target.value)}><option value="article">Article</option><option value="collection">Collection</option></CustomSelect></label>
          <form className="admin-featured-search" role="search" onSubmit={(event) => { event.preventDefault(); setCandidateQuery(candidateSearch.trim()); setCandidatePage(1); }}>
            <label><span>搜索{draft.content_type === "article" ? "文章" : "合集"}</span><input data-autofocus type="search" maxLength={100} value={candidateSearch} disabled={busy} placeholder={draft.content_type === "article" ? "输入标题、摘要或作者" : "输入名称、slug 或创建者"} onChange={(event) => setCandidateSearch(event.target.value)} /></label>
            <button className="btn btn-secondary" type="submit" disabled={busy || candidateState.loading}>搜索</button>
          </form>

          <div className="admin-featured-results" aria-live="polite">
            {candidateState.loading ? <div className="profile-refresh" role="status">正在查找可精选内容…</div> : null}
            {candidateState.error ? <div className="inline-error" role="alert">{candidateState.error.message}<button className="btn btn-secondary btn-small" type="button" onClick={candidateState.reload}>重试</button></div> : null}
            {!candidateState.loading && !candidateState.error && !candidates.length ? <p className="admin-featured-empty">没有找到可精选内容。换个关键词，或切换内容类型。</p> : null}
            {candidates.length ? <div className="admin-featured-candidates">
              {candidates.map((item) => {
                const selected = draft.target_id === String(item.id);
                const owner = item.content_type === "article" ? item.author : item.creator;
                return <article className={`admin-featured-candidate${selected ? " is-selected" : ""}${item.featured ? " is-featured" : ""}`} key={`${item.content_type}-${item.id}`}>
                  <div>
                    <h3>{candidateTitle(item)}</h3>
                    <p>{item.content_type === "article" ? item.summary || "暂无摘要" : item.description || "暂无简介"}</p>
                    <small>{item.content_type === "article" ? `作者 @${owner?.username || "未知"}` : `创建者 @${owner?.username || "未知"}`} · 更新于 {formatDate(item.updated_at, true)}</small>
                    {item.content_type === "collection" ? <small>{item.member_count} 位成员 · {item.post_count} 篇内容</small> : null}
                  </div>
                  <button className="admin-featured-star" type="button" aria-pressed={selected} disabled={busy || Boolean(item.featured)} title={item.featured ? "该内容已经在精选列表中" : undefined} onClick={() => setDraft({ ...draft, target_id: String(item.id) })}>
                    <span aria-hidden="true">{item.featured || selected ? "★" : "☆"}</span>
                    <span>{item.featured ? `已精选${item.featured.is_active ? "" : "，当前停用"}` : selected ? "已选择" : "选为精选"}</span>
                  </button>
                </article>;
              })}
            </div> : null}
          </div>
          <Pagination page={candidatePagination.page || candidatePage} totalPages={candidatePagination.total_pages || 0} disabled={busy || candidateState.loading} onChange={setCandidatePage} />
          <details className="admin-featured-order">
            <summary>调整排序位置</summary>
            <label><span>排序值</span><input type="number" step="1" required value={draft.sort_order} disabled={busy} onChange={(event) => setDraft({ ...draft, sort_order: event.target.value })} /><small>已自动给出建议值。需要置顶时可填写更小的整数。</small></label>
          </details>
        </div> : null}
        {action?.type === "order" ? <label><span>排序值</span><input type="number" step="1" required value={draft.sort_order} disabled={busy} onChange={(event) => setDraft({ ...draft, sort_order: event.target.value })} /><small>整数；数值越小越靠前。</small></label> : null}
      </AdminActionDialog>
    </AdminPageFrame>
  );
}
