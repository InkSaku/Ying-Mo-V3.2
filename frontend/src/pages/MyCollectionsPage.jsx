import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { CollectionCard } from "../components/CollectionCard";
import { Pagination } from "../components/Pagination";
import { PersonalNav } from "../components/PersonalNav";
import { EmptyState, ErrorState, PageLoader } from "../components/States";
import { clampPageToTotal } from "../lib/pagination";

const PAGE_SIZE = 12;

function cleanPage(value) {
  const parsed = Number.parseInt(value || "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function MyCollectionsPage() {
  usePageMeta("我的合集");
  const [params, setParams] = useSearchParams();
  const page = cleanPage(params.get("page"));
  const state = useAsyncData(() => api.get(`/users/me/collections?page=${page}&page_size=${PAGE_SIZE}`), [page]);
  const pagination = state.meta?.pagination || {};
  const clampedPage = clampPageToTotal(page, pagination.total || 0, pagination.page_size || PAGE_SIZE);
  const pageNeedsClamp = Boolean(state.meta) && clampedPage !== page;
  const emptyShelfSlots = Math.max(0, Math.min(3, 4 - (state.data?.length || 0)));

  useEffect(() => {
    if (pageNeedsClamp) setParams(clampedPage === 1 ? {} : { page: String(clampedPage) }, { replace: true });
  }, [clampedPage, pageNeedsClamp, setParams]);

  if (state.loading) return <PageLoader label="正在读取我的合集" />;
  if (state.error) return <main className="page-shell"><ErrorState error={state.error} onRetry={state.reload} /></main>;

  return (
    <main className="page-shell personal-page-shell collection-library-page collection-library-page-editorial collection-library-personal" aria-busy={pageNeedsClamp || undefined}>
      <PersonalNav />
      <header className="collection-library-hero collection-library-hero-compact collection-library-hero-editorial">
        <div className="collection-library-copy">
          <p className="hero-kicker"></p>
          <h1>我的合集</h1>
          <p>你创建或加入的合集。</p>
        </div>
        <aside className="collection-library-index"><span className="tabular">{pagination.total || 0}</span><div><strong>册合集</strong><p></p></div><Link className="btn btn-primary" to="/collections/new">创建合集</Link></aside>
      </header>
      {pageNeedsClamp ? <div className="profile-refresh" role="status">正在返回有效页码…</div> : state.data?.length ? (
        <section className="collection-library-shelf" aria-labelledby="my-collection-library-title">
          <header>
            <div><p>第 {String(page).padStart(2, "0")} 页</p><h2 id="my-collection-library-title">合集目录</h2></div>
            <span>按最近更新时间排列</span>
          </header>
          <div className="collection-bookshelf" aria-label="我的合集书架" tabIndex={state.data.length > 4 ? 0 : undefined}>
            <div className="collection-bookshelf-track">
              {state.data.map((collection, index) => <CollectionCard key={collection.id} collection={collection} index={(page - 1) * PAGE_SIZE + index} variant="shelf" />)}
              {Array.from({ length: emptyShelfSlots }, (_, index) => <span className="collection-bookshelf-slot" key={`empty-shelf-slot-${index}`} aria-hidden="true" />)}
            </div>
          </div>
        </section>
      ) : <EmptyState title="还没有合集" description="创建一个合集，或请朋友邀请你加入。" />}
      <Pagination
        page={pagination.page || page}
        totalPages={pagination.total_pages || 0}
        disabled={pageNeedsClamp}
        onChange={(nextPage) => setParams(nextPage === 1 ? {} : { page: String(nextPage) })}
      />
    </main>
  );
}
