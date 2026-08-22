import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { Pagination } from "../components/Pagination";
import { PersonalNav } from "../components/PersonalNav";
import { EmptyState, ErrorState, PageLoader } from "../components/States";
import { formatDate } from "../lib/format";
import { markNotificationReadForNavigation } from "../lib/notifications";
import { clampPageToTotal } from "../lib/pagination";

const PAGE_SIZE = 20;

function cleanPage(value) {
  const parsed = Number.parseInt(value || "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function NotificationsPage() {
  usePageMeta("通知");
  const [params, setParams] = useSearchParams();
  const page = cleanPage(params.get("page"));
  const state = useAsyncData(() => api.get(`/notifications?page=${page}&page_size=${PAGE_SIZE}`), [page]);
  const reloadNotifications = state.reload;
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const pagination = state.meta?.pagination || {};
  const clampedPage = clampPageToTotal(page, pagination.total || 0, pagination.page_size || PAGE_SIZE);
  const pageNeedsClamp = Boolean(state.meta) && clampedPage !== page;

  useEffect(() => {
    if (pageNeedsClamp) setParams(clampedPage === 1 ? {} : { page: String(clampedPage) }, { replace: true });
  }, [clampedPage, pageNeedsClamp, setParams]);

  useEffect(() => {
    const handleNewNotifications = () => { void reloadNotifications(); };
    window.addEventListener("yingmo:new-notifications", handleNewNotifications);
    return () => window.removeEventListener("yingmo:new-notifications", handleNewNotifications);
  }, [reloadNotifications]);

  const announceNotificationChange = () => {
    window.dispatchEvent(new CustomEvent("yingmo:notifications-changed"));
  };

  const runAction = async (kind, id = null) => {
    setBusy(id || kind);
    setActionError("");
    setMessage("");
    try {
      if (kind === "all") await api.post("/notifications/read-all", {});
      else await api.post(`/notifications/${id}/read`, {});
      announceNotificationChange();
      setMessage(kind === "all" ? "全部通知已标记为已读。" : "通知已标记为已读。");
      await state.reload();
    } catch (error) {
      setActionError(`${kind === "all" ? "全部标记" : "标记已读"}失败：${error.message}`);
    } finally {
      setBusy(null);
    }
  };

  const markReadOnOpen = (item) => {
    if (item.is_read) return;
    void markNotificationReadForNavigation(api, item.id, announceNotificationChange);
  };

  if (state.loading && !state.data) return <PageLoader label="正在读取通知" />;
  if (state.error) return <main className="page-shell"><ErrorState error={state.error} onRetry={state.reload} /></main>;

  return (
    <main className="page-shell" aria-busy={state.loading || Boolean(busy) || pageNeedsClamp || undefined}>
      <PersonalNav />
      <header className="page-heading">
        <div><h1>通知</h1><p>通知目标同样经过后端 ACL 处理，无权目标不会泄露地址。</p></div>
        {state.data?.some((item) => !item.is_read) ? (
          <button className="btn btn-secondary" type="button" disabled={Boolean(busy) || state.loading} onClick={() => { void runAction("all"); }}>
            {busy === "all" ? "处理中" : "全部已读"}
          </button>
        ) : null}
      </header>
      {actionError ? <div className="inline-error notification-feedback" role="alert">{actionError}</div> : null}
      {message ? <div className="inline-success notification-feedback" role="status">{message}</div> : null}
      {state.loading ? <div className="profile-refresh" role="status">正在更新通知…</div> : null}
      {pageNeedsClamp ? <div className="profile-refresh" role="status">正在返回有效页码…</div> : state.data?.length ? (
        <div className="notification-list">
          {state.data.map((item) => (
            <article key={item.id} className={item.is_read ? "" : "unread"}>
              <div className="notification-copy">
                <div className="notification-message-row">
                  {!item.is_read ? <span className="notification-unread-label">未读</span> : null}
                  <p>{item.message}</p>
                </div>
                <time dateTime={item.created_at}>{formatDate(item.created_at, true)}</time>
              </div>
              <div className="notification-actions">
                {item.target_url ? (
                  <Link
                    to={item.target_url}
                    aria-label={`${item.is_read ? "查看" : "查看并标记已读"}：${item.message}`}
                    onClick={() => markReadOnOpen(item)}
                  >
                    {item.is_read ? "查看" : "查看并标记已读"}
                  </Link>
                ) : null}
                {!item.is_read ? (
                  <button className="text-button" type="button" disabled={Boolean(busy) || state.loading} onClick={() => { void runAction("one", item.id); }}>
                    {busy === item.id ? "处理中" : "标记已读"}
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : <EmptyState title="还没有通知" />}
      <Pagination
        page={pagination.page || page}
        totalPages={pagination.total_pages || 0}
        disabled={Boolean(busy) || state.loading || pageNeedsClamp}
        onChange={(nextPage) => {
          setActionError("");
          setMessage("");
          setParams(nextPage === 1 ? {} : { page: String(nextPage) });
        }}
      />
    </main>
  );
}
