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
  const emptyShelfSlots = Math.max(0, Math.min(3, 4 - (state.data?.length || 0)));

  useEffect(() => {
    if (pageNeedsClamp) setParams(clampedPage === 1 ? {} : { page: String(clampedPage) }, { replace: true });
  }, [clampedPage, pageNeedsClamp, setParams]);

  if (state.loading) return <PageLoader />;
  if (state.error) return <main className="page-shell"><ErrorState error={state.error} onRetry={state.reload} /></main>;

  return (
    <main className="page-shell collection-library-page collection-library-page-editorial" aria-busy={pageNeedsClamp || undefined}>
      <header className="collection-library-hero collection-library-hero-editorial">
        <div className="collection-library-copy">
          <p className="hero-kicker">Collection Library</p>
          <h1>共同记录，<br />分册保存。</h1>
          <p>每一册都由真实作者共同写成。这里仅陈列你作为创建者或成员有权进入的记录。</p>
        </div>
        <aside className="collection-library-index" aria-label="合集目录概览">
          <span className="tabular">{pagination.total || 0}</span>
          <div><strong>册可进入的合集</strong><p>包含自己创建与朋友共同维护的 Collection。</p></div>
          <Link className="btn btn-primary" to="/collections/new">创建新册</Link>
        </aside>
      </header>
      {pageNeedsClamp
        ? <div className="profile-refresh" role="status">正在返回有效页码…</div>
        : state.data?.length
        ? <section className="collection-library-shelf" aria-labelledby="collection-library-title">
            <header><div><p>LIBRARY / {String(page).padStart(2, "0")}</p><h2 id="collection-library-title">最近打开的册页</h2></div><span>按最近更新时间排列</span></header>
            <div className="collection-bookshelf" aria-label="合集书架" tabIndex={state.data.length > 4 ? 0 : undefined}>
              <div className="collection-bookshelf-track">
                {state.data.map((item, index) => <CollectionCard key={item.id} collection={item} index={(page - 1) * PAGE_SIZE + index} variant="shelf" />)}
                {Array.from({ length: emptyShelfSlots }, (_, index) => <span className="collection-bookshelf-slot" key={`empty-shelf-slot-${index}`} aria-hidden="true" />)}
              </div>
            </div>
          </section>
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
