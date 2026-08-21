import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { PostFilters } from "../components/PostFilters";
import { PostCard } from "../components/PostCard";
import { EmptyState, ErrorState, PageLoader } from "../components/States";
import { Pagination } from "../components/Pagination";
import { clampPageToTotal } from "../lib/pagination";
import { hasActivePostFilters, postFilterSearchParams, postsApiPath, readPostFilters } from "../lib/postBrowsing";

const PAGE_SIZE = 12;

export function PostsPage({ type }) {
  const isArticle = type === "article";
  usePageMeta(isArticle ? "文章" : "随记");
  const [params, setParams] = useSearchParams();
  const filters = readPostFilters(params, type);
  const { page } = filters;
  const canonicalParams = postFilterSearchParams(filters).toString();
  const path = postsApiPath(type, filters, PAGE_SIZE);
  const state = useAsyncData(
    () => api.get(path),
    [path]
  );
  const optionState = useAsyncData(() => api.get(`/posts/filter-options?post_type=${type}`), [type]);

  const pagination = state.meta?.pagination || {};
  const totalPages = pagination.total_pages || 0;
  const clampedPage = clampPageToTotal(page, pagination.total || 0, pagination.page_size || PAGE_SIZE);
  const pageNeedsClamp = Boolean(state.meta) && clampedPage !== page;

  useEffect(() => {
    if (params.toString() !== canonicalParams) setParams(canonicalParams, { replace: true });
  }, [canonicalParams, params, setParams]);

  useEffect(() => {
    if (!pageNeedsClamp) return;
    const next = new URLSearchParams(params);
    if (clampedPage === 1) next.delete("page");
    else next.set("page", String(clampedPage));
    setParams(next, { replace: true });
  }, [clampedPage, pageNeedsClamp, params, setParams]);

  const changeFilter = (key, value) => {
    setParams(postFilterSearchParams({ ...filters, [key]: value, page: 1 }));
  };

  if (state.loading && !state.data) return <PageLoader />;
  if (state.error) return <main className="page-shell"><ErrorState error={state.error} onRetry={state.reload} /></main>;

  return (
    <main className="page-shell" aria-busy={state.loading || pageNeedsClamp || undefined}>
      <header className="page-heading">
        <div>
          <h1>{isArticle ? "文章" : "随记"}</h1>
          <p>{isArticle ? "较完整的长内容、学习笔记与思考。" : "更轻的生活片段、地点、心情与即时记录。"}</p>
        </div>
      </header>

      <PostFilters type={type} filters={filters} options={optionState.data || {}} loading={optionState.loading} onChange={changeFilter} onClear={() => setParams("")} />

      {pageNeedsClamp ? (
        <div className="profile-refresh" role="status">正在返回有效页码…</div>
      ) : !state.data?.length ? (
        <EmptyState title={hasActivePostFilters(filters) ? "当前筛选下没有内容" : `还没有可见${isArticle ? "文章" : "随记"}`} description={hasActivePostFilters(filters) ? "调整或清除筛选条件后再试。" : "这里只会出现你有权读取的已发布或归档内容。"} />
      ) : (
        <div className={isArticle ? "two-column-grid" : "note-stream"}>
          {state.data.map((post) => <PostCard key={post.id} post={post} compact={!isArticle} />)}
        </div>
      )}

      <Pagination page={pagination.page || page} totalPages={totalPages} disabled={pageNeedsClamp} onChange={(next) => {
        const nextParams = new URLSearchParams(params);
        nextParams.set("page", String(next));
        setParams(nextParams);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }} />
    </main>
  );
}
