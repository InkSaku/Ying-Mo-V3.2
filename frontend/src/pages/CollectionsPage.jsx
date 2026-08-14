import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { CollectionCard } from "../components/CollectionCard";
import { EmptyState, ErrorState, PageLoader } from "../components/States";
import { Pagination } from "../components/Pagination";
import { clampPageToTotal } from "../lib/pagination";

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
    <main className="page-shell" aria-busy={pageNeedsClamp || undefined}>
      <header className="page-heading">
        <div>
          <h1>Collection</h1>
          <p>只展示你作为创建者或共同成员有权进入的合集。</p>
        </div>
        <Link className="btn btn-primary" to="/collections/new">创建合集</Link>
      </header>
      {pageNeedsClamp
        ? <div className="profile-refresh" role="status">正在返回有效页码…</div>
        : state.data?.length
        ? <div className="collection-grid">{state.data.map((item) => <CollectionCard key={item.id} collection={item} />)}</div>
        : <EmptyState title="还没有 Collection" description="创建一个合集，或让朋友把你加入共同记录。" />}
      <Pagination
        page={pagination.page || page}
        totalPages={pagination.total_pages || 1}
        disabled={pageNeedsClamp}
        onChange={(nextPage) => setParams(nextPage === 1 ? {} : { page: String(nextPage) })}
      />
    </main>
  );
}
