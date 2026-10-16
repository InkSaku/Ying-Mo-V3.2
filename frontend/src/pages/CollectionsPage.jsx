import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { CollectionCard } from "../components/CollectionCard";
import { EmptyState, ErrorState, PageLoader } from "../components/States";
import { Pagination } from "../components/Pagination";
import { clampPageToTotal } from "../lib/pagination";
import { CollectionSketch } from "../components/CollectionSketch";
import "../styles/collections-editorial.css";

const PAGE_SIZE = 20;

export function CollectionsPage() {
  usePageMeta("合集");
  const [params, setParams] = useSearchParams();
  const parsedPage = Number.parseInt(params.get("page") || "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const state = useAsyncData(() => api.get(`/collections?page=${page}&page_size=${PAGE_SIZE}`), [page]);
  const pagination = state.meta?.pagination || {};
  const clampedPage = clampPageToTotal(page, pagination.total || 0, pagination.page_size || PAGE_SIZE);
  const pageNeedsClamp = Boolean(state.meta) && clampedPage !== page;

  useEffect(() => {
    if (pageNeedsClamp) setParams(clampedPage === 1 ? {} : { page: String(clampedPage) }, { replace: true });
  }, [clampedPage, pageNeedsClamp, setParams]);

  if (state.loading) return <PageLoader />;
  if (state.error) return <main className="page-shell"><ErrorState error={state.error} onRetry={state.reload} /></main>;

  return (
    <main className="page-shell collection-library-page collection-library-page-editorial" aria-busy={pageNeedsClamp || undefined}>
      <header className="collection-library-hero collection-library-hero-editorial">
        <div className="collection-library-copy">
          <p className="hero-kicker"></p>
          <h1>合集<br /></h1>
          <p>你创建或参与的合集。</p>
        </div>
        <div className="collection-library-drawing"><p aria-hidden="true"><br /><span></span></p><CollectionSketch /></div>
        <aside className="collection-library-index" aria-label="合集目录概览">
          <span className="tabular">{pagination.total || 0}</span>
          <div><strong>册合集</strong><p></p></div>
          <Link className="btn btn-primary" to="/collections/new">创建合集</Link>
        </aside>
      </header>
      {pageNeedsClamp
        ? <div className="profile-refresh" role="status">正在返回有效页码…</div>
        : state.data?.length
        ? <section className="collection-library-shelf" aria-labelledby="collection-library-title">
            <header><div><p>第 {String(page).padStart(2, "0")} 页</p><h2 id="collection-library-title">合集目录</h2></div><span>按最近更新时间排列</span></header>
            <div className="collection-bookshelf" aria-label="合集书架">
              <div className="collection-bookshelf-track">
                {state.data.map((item, index) => <CollectionCard key={item.id} collection={item} index={(page - 1) * PAGE_SIZE + index} variant="shelf" />)}
              </div>
            </div>
          </section>
        : <EmptyState illustrated title="还没有合集" description="创建一个合集，或请朋友邀请你加入。" />}
      <Pagination
        page={pagination.page || page}
        totalPages={pagination.total_pages || 1}
        disabled={pageNeedsClamp}
        onChange={(nextPage) => setParams(nextPage === 1 ? {} : { page: String(nextPage) })}
      />
    </main>
  );
}
