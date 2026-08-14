import { useState } from "react";
import { AdminActionDialog, AdminPageFrame } from "../components/AdminPanel";
import { CustomSelect } from "../components/CustomSelect";
import { EmptyState, ErrorState } from "../components/States";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";

function targetLabel(item) {
  if (!item.target) return `${item.content_type === "article" ? "Article" : "Collection"} 目标不存在`;
  return item.content_type === "article"
    ? item.target.title || `Article #${item.post_id}`
    : item.target.name || `Collection #${item.collection_id}`;
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

  const openAction = (type, item = null) => {
    setAction({ type, item });
    setReason(""); setActionError(null); setMessage("");
    setDraft(item ? {
      content_type: item.content_type,
      target_id: String(item.post_id || item.collection_id || ""),
      sort_order: String(item.sort_order),
    } : { content_type: "article", target_id: "", sort_order: "0" });
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
    create: "只能选择已发布且治理状态正常的 Article，或状态正常的 Collection。精选不会扩大任何成员权限。",
    order: "数值越小越靠前；Article 与 Collection 分别在各自首页区块中排序。",
    toggle: action?.item?.is_active ? "停用后立即退出首页精选结果，但保留配置记录。" : "重新启用前，后端会再次校验目标是否仍可用。",
    delete: "删除只移除精选配置，不会删除 Article 或 Collection。",
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

      <AdminActionDialog open={Boolean(action)} title={titles[action?.type]} description={descriptions[action?.type]} confirmLabel={action?.type === "delete" ? "确认删除" : action?.type === "toggle" ? (action.item.is_active ? "确认停用" : "确认启用") : "确认保存"} reason={reason} busy={busy} error={actionError?.message} confirmDisabled={draftInvalid} onReasonChange={setReason} onConfirm={() => { void confirmAction(); }} onClose={closeAction}>
        {action?.type === "create" ? <div className="admin-dialog-fields">
          <label><span>目标类型</span><CustomSelect value={draft.content_type} disabled={busy} onChange={(event) => setDraft({ ...draft, content_type: event.target.value, target_id: "" })}><option value="article">Article</option><option value="collection">Collection</option></CustomSelect></label>
          <label><span>{draft.content_type === "article" ? "Article ID" : "Collection ID"}</span><input inputMode="numeric" pattern="[1-9][0-9]*" required value={draft.target_id} disabled={busy} onChange={(event) => setDraft({ ...draft, target_id: event.target.value.replace(/\D/g, "") })} /></label>
        </div> : null}
        {action?.type === "create" || action?.type === "order" ? <label><span>排序值</span><input type="number" step="1" required value={draft.sort_order} disabled={busy} onChange={(event) => setDraft({ ...draft, sort_order: event.target.value })} /><small>整数；数值越小越靠前。</small></label> : null}
      </AdminActionDialog>
    </AdminPageFrame>
  );
}
