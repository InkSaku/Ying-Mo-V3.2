import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { PostCard } from "../components/PostCard";
import { Pagination } from "../components/Pagination";
import { PersonalNav } from "../components/PersonalNav";
import { EmptyState, ErrorState, PageLoader } from "../components/States";
import { clampPageToTotal, pageAfterRemovingItem } from "../lib/pagination";

const PAGE_SIZE = 20;

function cleanPage(value) {
  const parsed = Number.parseInt(value || "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function FavoritesPage() {
  usePageMeta("收藏");
  const [params, setParams] = useSearchParams();
  const page = cleanPage(params.get("page"));
  const state = useAsyncData(() => api.get(`/interactions/favorites?page=${page}&page_size=${PAGE_SIZE}`), [page]);
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const pagination = state.meta?.pagination || {};

  const goToPage = (nextPage, { preserveFeedback = false } = {}) => {
    if (!preserveFeedback) {
      setMessage("");
      setActionError("");
    }
    setParams(nextPage === 1 ? {} : { page: String(nextPage) });
  };

  useEffect(() => {
    if (state.loading || state.error || !state.meta) return;
    const nextPage = clampPageToTotal(page, pagination.total || 0, pagination.page_size || PAGE_SIZE);
    if (nextPage !== page) goToPage(nextPage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pagination.page_size, pagination.total, state.error, state.loading, state.meta]);

  const removeFavorite = async (post) => {
    setBusyId(post.id);
    setMessage("");
    setActionError("");
    try {
      const result = await api.post(`/interactions/posts/${post.id}/favorite`, {});
      if (result.data?.favorited !== false) {
        setActionError("收藏状态已经变化，请刷新后重试。");
        await state.reload();
        return;
      }
      setMessage(`已取消收藏“${post.title || (post.post_type === "note" ? "未命名随记" : "未命名文章")}”。`);
      const nextPage = pageAfterRemovingItem({
        page,
        total: pagination.total || state.data?.length || 0,
        pageSize: pagination.page_size || PAGE_SIZE,
      });
      if (nextPage !== page) goToPage(nextPage, { preserveFeedback: true });
      else await state.reload();
    } catch (error) {
      setActionError(`取消收藏失败：${error.message}`);
    } finally {
      setBusyId(null);
    }
  };

  if (state.loading && !state.data) return <PageLoader label="正在读取收藏" />;
  if (state.error) return <main className="page-shell"><ErrorState error={state.error} onRetry={state.reload} /></main>;
  return (
    <main className="page-shell" aria-busy={state.loading || Boolean(busyId) || undefined}>
      <PersonalNav />
      <header className="page-heading">
        <div><h1>收藏</h1><p>只保留你当前仍有权访问的收藏内容。</p></div>
        <span className="personal-page-total tabular">共 {pagination.total || 0} 篇</span>
      </header>
      {actionError ? <div className="inline-error favorite-feedback" role="alert">{actionError}</div> : null}
      {message ? <div className="inline-success favorite-feedback" role="status">{message}</div> : null}
      {state.loading ? <div className="profile-refresh" role="status">正在更新收藏…</div> : null}
      {state.data?.length
        ? (
          <div className="note-stream">
            {state.data.map((post) => (
              <div className="favorite-list-item" key={post.id}>
                <PostCard post={post} compact />
                <div className="favorite-list-action">
                  <button
                    className="btn btn-secondary"
                    type="button"
                    disabled={busyId !== null || state.loading}
                    aria-pressed={true}
                    aria-label={`取消收藏：${post.title || (post.post_type === "note" ? "未命名随记" : "未命名文章")}`}
                    onClick={() => { void removeFavorite(post); }}
                  >
                    {busyId === post.id ? "正在取消" : "取消收藏"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
        : <EmptyState title="还没有可见收藏" description="收藏内容失去访问权限后，不会在这里泄漏正文或 Collection 信息。" />}
      <Pagination
        page={pagination.page || page}
        totalPages={pagination.total_pages || 0}
        onChange={goToPage}
      />
    </main>
  );
}
