import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminActionDialog, AdminPageFrame, AdminStatus } from "../components/AdminPanel";
import { CustomSelect } from "../components/CustomSelect";
import { EmptyState, ErrorState } from "../components/States";
import { Pagination } from "../components/Pagination";
import { ProtectedImage } from "../components/ProtectedImage";
import { ProtectedVideo } from "../components/ProtectedVideo";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { api } from "../lib/api";
import { adminMediaApiPath, adminMediaSearchParams, readAdminMediaFilters } from "../lib/admin";
import { formatDate } from "../lib/format";
import { clampPageToTotal } from "../lib/pagination";

const PAGE_SIZE = 20;

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function bindingText(item) {
  if (!item.binding) return "未绑定";
  const state = [item.binding.status, item.binding.moderation_status === "hidden" ? "已隐藏" : "", item.binding.deleted_at ? "已删除" : ""]
    .filter(Boolean).join(" · ");
  return `${item.binding.label}${state ? ` · ${state}` : ""}${item.binding.exists ? "" : " · 目标不存在"}`;
}

function MediaPreview({ item }) {
  const image = item.pair.find((part) => part.kind !== "live_photo_video");
  const video = item.pair.find((part) => part.kind === "live_photo_video");
  return (
    <section className="admin-media-preview" aria-label={`${item.logical_kind === "live_photo" ? "Live Photo" : "图片"} #${item.id} 审计预览`}>
      <div>
        <ProtectedImage
          path={image?.admin_read_path}
          alt={`媒体 #${image?.id || item.id} 审计预览`}
          fallback={<div className="media-inline-error" role="status">图片暂时无法读取。</div>}
        />
      </div>
      {video ? <ProtectedVideo path={video.admin_read_path} label={`Live Photo #${item.id} 视频审计预览`} /> : null}
      <p>此预览使用独立 Admin 读取接口，每次读取都会写入审计日志。</p>
    </section>
  );
}

export function AdminMediaPage() {
  usePageMeta("媒体管理");
  const [params, setParams] = useSearchParams();
  const filters = readAdminMediaFilters(params);
  const [ownerValue, setOwnerValue] = useState(filters.owner_id);
  const [previewId, setPreviewId] = useState(null);
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [message, setMessage] = useState("");
  const canonicalParams = adminMediaSearchParams(filters).toString();
  const state = useAsyncData(() => api.get(adminMediaApiPath(filters, PAGE_SIZE)), [filters.kind, filters.status, filters.owner_id, filters.bound_type, filters.page]);
  const pagination = state.meta?.pagination || {};
  const clampedPage = clampPageToTotal(filters.page, pagination.total || 0, pagination.page_size || PAGE_SIZE);
  const pageNeedsClamp = Boolean(state.data) && clampedPage !== filters.page;

  useEffect(() => setOwnerValue(filters.owner_id), [filters.owner_id]);
  useEffect(() => { if (params.toString() !== canonicalParams) setParams(canonicalParams, { replace: true }); }, [canonicalParams, params, setParams]);
  useEffect(() => {
    if (pageNeedsClamp) setParams(adminMediaSearchParams({ ...filters, page: clampedPage }), { replace: true });
  }, [clampedPage, filters, pageNeedsClamp, setParams]);

  const updateFilters = (updates) => {
    setPreviewId(null);
    setParams(adminMediaSearchParams({ ...filters, ...updates, page: updates.page || 1 }));
  };
  const openAction = (type, item) => {
    setAction({ type, item }); setReason(""); setActionError(null); setMessage("");
  };
  const closeAction = () => { if (!actionBusy) setAction(null); };
  const confirmAction = async () => {
    if (!action || actionBusy || !reason.trim()) return;
    setActionBusy(true); setActionError(null);
    try {
      if (action.type === "delete") {
        await api.delete(`/admin/media/${action.item.id}`, { body: { reason: reason.trim() } });
      } else {
        await api.post(`/admin/media/${action.item.id}/${action.type}`, { reason: reason.trim() });
      }
      const verb = action.type === "hide" ? "隐藏" : action.type === "restore" ? "恢复" : "软删除";
      setMessage(`已${verb}${action.item.logical_kind === "live_photo" ? "整组 Live Photo" : `媒体 #${action.item.id}`}。`);
      setPreviewId(null);
      setAction(null);
      await state.reload();
    } catch (error) {
      setActionError(error);
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <AdminPageFrame title="媒体" description="审阅私有媒体、绑定目标与 Live Photo 配对状态。Admin 预览独立审计，普通内容 ACL 不会因此放宽。" busy={state.loading || actionBusy || pageNeedsClamp} actions={<span className="personal-page-total tabular">共 {pagination.total || 0} 组</span>}>
      <form className="admin-content-filters admin-media-filters" role="search" onSubmit={(event) => { event.preventDefault(); updateFilters({ owner_id: ownerValue.replace(/\D/g, ""), page: 1 }); }}>
        <label className="admin-filter-search"><span>所有者用户 ID</span><input inputMode="numeric" pattern="[1-9][0-9]*" value={ownerValue} onChange={(event) => setOwnerValue(event.target.value.replace(/\D/g, ""))} placeholder="例如 42" /></label>
        <label><span>类型</span><CustomSelect value={filters.kind} onChange={(event) => updateFilters({ kind: event.target.value, page: 1 })}><option value="">全部类型</option><option value="image">图片</option><option value="live_photo">Live Photo</option></CustomSelect></label>
        <label><span>状态</span><CustomSelect value={filters.status} onChange={(event) => updateFilters({ status: event.target.value, page: 1 })}><option value="">全部状态</option><option value="active">正常</option><option value="hidden">已隐藏</option></CustomSelect></label>
        <label><span>绑定</span><CustomSelect value={filters.bound_type} onChange={(event) => updateFilters({ bound_type: event.target.value, page: 1 })}><option value="">全部绑定</option><option value="post">Post</option><option value="collection">Collection</option><option value="avatar">头像</option><option value="unbound">未绑定</option></CustomSelect></label>
        <button className="btn btn-secondary" type="submit" disabled={state.loading || actionBusy}>筛选</button>
      </form>

      {message ? <div className="inline-success admin-feedback" role="status">{message}</div> : null}
      {state.loading && !state.data ? <div className="skeleton-stack" role="status"><span className="sr-only">正在读取媒体列表</span><div className="skeleton-block" /></div> : null}
      {state.error ? <ErrorState error={state.error} onRetry={state.reload} /> : null}
      {state.loading && state.data ? <div className="profile-refresh" role="status">正在更新媒体列表…</div> : null}
      {pageNeedsClamp ? <div className="profile-refresh" role="status">正在返回有效页码…</div> : null}

      {state.data && !pageNeedsClamp ? state.data.length ? <div className="admin-content-list">
        {state.data.map((item) => {
          const deleted = Boolean(item.deleted_at);
          const totalBytes = item.pair.reduce((sum, part) => sum + (Number(part.byte_size) || 0), 0);
          return (
            <article className="admin-content-row admin-media-row" key={item.id}>
              <div className="admin-content-main">
                <div className="admin-content-title"><h2>{item.logical_kind === "live_photo" ? "Live Photo" : "图片"} #{item.id}</h2><AdminStatus value={deleted ? "deleted" : item.status} />{!item.pair_integrity ? <span className="admin-status admin-status-hidden">配对异常</span> : null}</div>
                <small>所有者 @{item.owner?.username || "未知"} · 用户 #{item.owner_id}</small>
                <small>绑定：{bindingText(item)}</small>
                <small>Public ID：{item.public_id}</small>
                {item.live_photo_pair_id ? <small>Pair ID：{item.live_photo_pair_id} · {item.pair.length} 个文件</small> : null}
              </div>
              <dl className="admin-content-meta">
                <div><dt>文件</dt><dd>{item.pair.map((part) => part.mime_type).join(" + ")} · {formatBytes(totalBytes)}</dd></div>
                <div><dt>尺寸</dt><dd>{item.width && item.height ? `${item.width} × ${item.height}` : "未记录"}</dd></div>
                <div><dt>创建</dt><dd><time dateTime={item.created_at}>{formatDate(item.created_at, true)}</time></dd></div>
                {deleted ? <div><dt>软删除</dt><dd><time dateTime={item.deleted_at}>{formatDate(item.deleted_at, true)}</time></dd></div> : null}
              </dl>
              <div className="admin-content-actions">
                <button className="btn btn-secondary btn-small" type="button" aria-expanded={previewId === item.id} disabled={actionBusy} onClick={() => setPreviewId((current) => current === item.id ? null : item.id)}>{previewId === item.id ? "收起预览" : "审计预览"}</button>
                {!deleted && item.pair_integrity ? <button className="btn btn-secondary btn-small" type="button" disabled={actionBusy} onClick={() => openAction(item.status === "hidden" ? "restore" : "hide", item)}>{item.status === "hidden" ? "恢复" : "隐藏"}</button> : null}
                {!deleted && item.pair_integrity ? <button className="btn btn-danger btn-small" type="button" disabled={actionBusy} onClick={() => openAction("delete", item)}>软删除</button> : null}
              </div>
              {previewId === item.id ? <MediaPreview item={item} /> : null}
            </article>
          );
        })}
      </div> : <EmptyState title="没有匹配的媒体" description="调整媒体类型、状态、所有者或绑定条件后重试。" /> : null}

      <Pagination page={pagination.page || filters.page} totalPages={pagination.total_pages || 0} disabled={state.loading || actionBusy || pageNeedsClamp} onChange={(page) => updateFilters({ page })} />
      <AdminActionDialog
        open={Boolean(action)}
        title={action?.type === "hide" ? "隐藏媒体" : action?.type === "restore" ? "恢复媒体" : "软删除媒体"}
        description={action?.type === "hide" ? "隐藏后普通读取会立即拒绝；Live Photo 的图片与视频会一起隐藏。" : action?.type === "restore" ? "恢复后仍只按原绑定内容的 ACL 提供普通读取。" : "软删除后不能在此页恢复；存储文件保留供审计与后续清理。"}
        confirmLabel={action?.type === "hide" ? "确认隐藏" : action?.type === "restore" ? "确认恢复" : "确认软删除"}
        reason={reason}
        busy={actionBusy}
        error={actionError?.message}
        onReasonChange={setReason}
        onConfirm={() => { void confirmAction(); }}
        onClose={closeAction}
      >
        {action?.item?.logical_kind === "live_photo" ? <p className="meta-text">本次操作会同时影响 Pair {action.item.live_photo_pair_id} 的图片与视频。</p> : null}
      </AdminActionDialog>
    </AdminPageFrame>
  );
}
