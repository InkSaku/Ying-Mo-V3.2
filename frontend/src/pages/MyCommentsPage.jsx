import { InkPageSketch } from "../components/InkPageSketch";
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { Pagination } from "../components/Pagination";
import { PersonalNav } from "../components/PersonalNav";
import { EmptyState, ErrorState, PageLoader } from "../components/States";
import { formatDate, postTypeLabel } from "../lib/format";
import { clampPageToTotal } from "../lib/pagination";

const PAGE_SIZE = 20;

function cleanPage(value) {
  const parsed = Number.parseInt(value || "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function MyCommentsPage() {
  usePageMeta("我的评论");
  const [params, setParams] = useSearchParams();
  const page = cleanPage(params.get("page"));
  const state = useAsyncData(() => api.get(`/users/me/comments?page=${page}&page_size=${PAGE_SIZE}`), [page]);
  const pagination = state.meta?.pagination || {};
  const clampedPage = clampPageToTotal(page, pagination.total || 0, pagination.page_size || PAGE_SIZE);
  const pageNeedsClamp = Boolean(state.meta) && clampedPage !== page;

  useEffect(() => {
    if (pageNeedsClamp) setParams(clampedPage === 1 ? {} : { page: String(clampedPage) }, { replace: true });
  }, [clampedPage, pageNeedsClamp, setParams]);

  if (state.loading) return <PageLoader label="正在读取我的评论" />;
  if (state.error) return <main className="page-shell"><ErrorState error={state.error} onRetry={state.reload} /></main>;
  return (
    <main className="page-shell personal-page-shell" aria-busy={pageNeedsClamp || undefined}>
      <PersonalNav />
      <header className="page-heading">
        <InkPageSketch />
        <div><p className="section-kicker"></p><h1>我的评论</h1><p>查看你发表的评论。</p></div>
        <span className="personal-page-total tabular">共 {pagination.total || 0} 条</span>
      </header>
      {pageNeedsClamp ? <div className="profile-refresh" role="status">正在返回有效页码…</div> : state.data?.length ? (
        <div className="management-list comment-history-list">
          {state.data.map((item) => (
            <article key={item.id}>
              <div>
                <div className="comment-history-meta">
                  <time dateTime={item.created_at}>{formatDate(item.created_at, true)}</time>
                  <span>{item.status === "deleted" ? "已删除" : "正常"}</span>
                  {item.post ? <span>{postTypeLabel(item.post.post_type)}</span> : null}
                </div>
                <p>{item.body}</p>
                {item.post ? <p className="comment-history-target">评论于：{item.post.title || (item.post.post_type === "note" ? "未命名随记" : "未命名文章")}</p> : null}
              </div>
              {item.post?.canonical ? <Link className="btn btn-secondary" to={item.post.canonical}>查看内容</Link> : null}
            </article>
          ))}
        </div>
      ) : <EmptyState title="暂无可查看的评论" description="" />}
      <Pagination
        page={pagination.page || page}
        totalPages={pagination.total_pages || 0}
        disabled={pageNeedsClamp}
        onChange={(nextPage) => setParams(nextPage === 1 ? {} : { page: String(nextPage) })}
      />
    </main>
  );
}
