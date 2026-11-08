import { useEffect, useState } from "react";
import { JoinCollectionActions } from "../components/JoinCollectionActions";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { InkBrandMark } from "../components/InkBrandMark";
import { Pagination } from "../components/Pagination";
import { PersonalNav } from "../components/PersonalNav";
import { ProtectedImage } from "../components/ProtectedImage";
import { EmptyState, ErrorState, PageLoader } from "../components/States";
import { groupNotificationsByDay, markNotificationReadForNavigation, notificationClock, notificationSentence } from "../lib/notifications";
import { clampPageToTotal } from "../lib/pagination";
import "../styles/notifications.css";

const PAGE_SIZE = 20;

function cleanPage(value) {
  const parsed = Number.parseInt(value || "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function InboxAvatar({ actor }) {
  return <span className="inbox-avatar" aria-hidden="true">
    {actor
      ? <ProtectedImage media={actor.avatar_media} alt="" className="inbox-avatar-image" fallback={<InkBrandMark />} />
      : <InkBrandMark />}
  </span>;
}

export function NotificationsPage() {
  usePageMeta("通知");
  const [params, setParams] = useSearchParams();
  const page = cleanPage(params.get("page"));
  const state = useAsyncData(() => api.get(`/notifications?page=${page}&page_size=${PAGE_SIZE}`), [page]);
  const unreadState = useAsyncData(() => api.get("/notifications/unread-count"), []);
  const reloadNotifications = state.reload;
  const reloadUnread = unreadState.reload;
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const pagination = state.meta?.pagination || {};
  const clampedPage = clampPageToTotal(page, pagination.total || 0, pagination.page_size || PAGE_SIZE);
  const pageNeedsClamp = Boolean(state.meta) && clampedPage !== page;
  const unreadCount = unreadState.data?.unread_count ?? null;
  const pageUnreadCount = state.data?.filter((item) => !item.is_read).length || 0;
  const hasUnread = unreadCount > 0 || pageUnreadCount > 0;

  useEffect(() => {
    if (pageNeedsClamp) setParams(clampedPage === 1 ? {} : { page: String(clampedPage) }, { replace: true });
  }, [clampedPage, pageNeedsClamp, setParams]);

  useEffect(() => {
    const handleNewNotifications = () => {
      void reloadNotifications();
      void reloadUnread();
    };
    window.addEventListener("yingmo:new-notifications", handleNewNotifications);
    return () => window.removeEventListener("yingmo:new-notifications", handleNewNotifications);
  }, [reloadNotifications, reloadUnread]);

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
      setMessage(kind === "all" ? "全部通知已标为已读。" : "通知已标为已读。");
      await Promise.all([state.reload(), reloadUnread()]);
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
    <main className="page-shell personal-page-shell inbox-page" aria-busy={state.loading || Boolean(busy) || pageNeedsClamp || undefined}>
      <PersonalNav />
      <header className="inbox-header">
        <h1>通知</h1>
        {state.data?.length ? <p className="inbox-count">{unreadCount === null
          ? pageUnreadCount ? <>本页 <span className="tabular">{pageUnreadCount}</span> 条未读</> : unreadState.loading ? "正在读取未读数…" : "未读数暂不可用"
          : unreadCount ? <><span className="tabular">{unreadCount}</span> 条未读</> : "都读完了"}</p> : null}
        {hasUnread ? (
          <button className="text-button inbox-read-all" type="button" disabled={Boolean(busy) || state.loading} onClick={() => { void runAction("all"); }}>
            {busy === "all" ? "处理中" : "全部标为已读"}
          </button>
        ) : null}
      </header>
      {actionError ? <div className="inline-error inbox-feedback" role="alert">{actionError}</div> : null}
      <span className="sr-only" role="status">{message}</span>
      {pageNeedsClamp ? <div className="profile-refresh" role="status">正在返回有效页码…</div> : state.data?.length ? (
        <div className="inbox-days">
          {groupNotificationsByDay(state.data).map((group) => (
            <section className="inbox-day" key={group.key} aria-label={group.label}>
              <h2>{group.label}</h2>
              <ul>
                {group.items.map((item) => {
                  const sentence = notificationSentence(item);
                  const label = <>{sentence.actor ? <strong>{sentence.actor}</strong> : null}{sentence.text}</>;
                  return (
                    <li key={item.id} className={`inbox-row${item.is_read ? "" : " is-unread"}`}>
                      <InboxAvatar actor={sentence.actor ? item.actor : null} />
                      <div className="inbox-copy">
                        <p className="inbox-title">
                          {item.is_read ? null : <span className="sr-only">未读：</span>}
                          {item.target_url ? <Link className="inbox-link" to={item.target_url} onClick={() => markReadOnOpen(item)}>{label}</Link> : label}
                        </p>
                        {sentence.summary ? <p className="inbox-summary">{sentence.summary}</p> : null}
                        {item.kind === "site_member_joined" ? <JoinCollectionActions member={item.actor} options={item.join_options} className="inbox-join" /> : null}
                      </div>
                      <div className="inbox-meta">
                        <time className="tabular" dateTime={item.created_at}>{notificationClock(item.created_at)}</time>
                        {item.is_read ? null : (
                          <button className="inbox-read" type="button" disabled={Boolean(busy) || state.loading} onClick={() => { void runAction("one", item.id); }}>
                            {busy === item.id ? "处理中" : "标为已读"}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : <EmptyState sketch="inbox" title="还没有通知" description="朋友的评论、提及和合集动态会出现在这里。" />}
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
