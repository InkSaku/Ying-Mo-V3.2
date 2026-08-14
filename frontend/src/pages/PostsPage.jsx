import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { CustomSelect } from "../components/CustomSelect";
import { PostCard } from "../components/PostCard";
import { EmptyState, ErrorState, PageLoader } from "../components/States";
import { Pagination } from "../components/Pagination";
import { clampPageToTotal } from "../lib/pagination";

const PAGE_SIZE = 12;

function cleanPage(value) {
  const parsed = Number.parseInt(value || "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function PostsPage({ type }) {
  const isArticle = type === "article";
  usePageMeta(isArticle ? "文章" : "随记");
  const [params, setParams] = useSearchParams();
  const page = cleanPage(params.get("page"));
  const sort = params.get("sort") || "newest";
  const state = useAsyncData(
    () => api.get(`/posts?post_type=${type}&sort=${encodeURIComponent(sort)}&page=${page}&page_size=${PAGE_SIZE}`),
    [type, sort, page]
  );

  const pagination = state.meta?.pagination || {};
  const totalPages = pagination.total_pages || 0;
  const clampedPage = clampPageToTotal(page, pagination.total || 0, pagination.page_size || PAGE_SIZE);
  const pageNeedsClamp = Boolean(state.meta) && clampedPage !== page;

  useEffect(() => {
    if (!pageNeedsClamp) return;
    const next = new URLSearchParams(params);
    if (clampedPage === 1) next.delete("page");
    else next.set("page", String(clampedPage));
    setParams(next, { replace: true });
  }, [clampedPage, pageNeedsClamp, params, setParams]);

  if (state.loading) return <PageLoader />;
  if (state.error) return <main className="page-shell"><ErrorState error={state.error} onRetry={state.reload} /></main>;

  return (
    <main className="page-shell" aria-busy={pageNeedsClamp || undefined}>
      <header className="page-heading">
        <div>
          <h1>{isArticle ? "文章" : "随记"}</h1>
          <p>{isArticle ? "较完整的长内容、学习笔记与思考。" : "更轻的生活片段、地点、心情与即时记录。"}</p>
        </div>
        <label className="sort-control">
          <span>排序</span>
          <CustomSelect value={sort} onChange={(event) => setParams({ sort: event.target.value, page: "1" })}>
            <option value="newest">最新</option>
            <option value="oldest">最早</option>
            <option value="updated">最近编辑</option>
          </CustomSelect>
        </label>
      </header>

      {pageNeedsClamp ? (
        <div className="profile-refresh" role="status">正在返回有效页码…</div>
      ) : !state.data?.length ? (
        <EmptyState title={`还没有可见${isArticle ? "文章" : "随记"}`} description="这里只会出现你有权读取的已发布或归档内容。" />
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
