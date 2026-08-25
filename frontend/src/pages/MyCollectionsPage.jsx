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
  usePageMeta("我的 Collection");
  const [params, setParams] = useSearchParams();
  const page = cleanPage(params.get("page"));
  const state = useAsyncData(() => api.get(`/users/me/collections?page=${page}&page_size=${PAGE_SIZE}`), [page]);
  const pagination = state.meta?.pagination || {};
  const clampedPage = clampPageToTotal(page, pagination.total || 0, pagination.page_size || PAGE_SIZE);
  const pageNeedsClamp = Boolean(state.meta) && clampedPage !== page;

  useEffect(() => {
    if (pageNeedsClamp) setParams(clampedPage === 1 ? {} : { page: String(clampedPage) }, { replace: true });
  }, [clampedPage, pageNeedsClamp, setParams]);

  if (state.loading) return <PageLoader label="正在读取我的 Collection" />;
  if (state.error) return <main className="page-shell"><ErrorState error={state.error} onRetry={state.reload} /></main>;

  return (
    <main className="page-shell collection-library-page collection-library-personal" aria-busy={pageNeedsClamp || undefined}>
      <PersonalNav />
      <header className="collection-library-hero collection-library-hero-compact">
        <div className="collection-library-copy">
          <p className="hero-kicker">My Collection Library</p>
          <h1>我的共同记录册。</h1>
          <p>包括你创建以及作为共同成员参与的 Collection。</p>
        </div>
        <aside className="collection-library-index"><span className="tabular">{pagination.total || 0}</span><div><strong>册个人目录</strong><p>只计算当前账号能够进入的合集。</p></div><Link className="btn btn-primary" to="/collections/new">创建新册</Link></aside>
      </header>
      {pageNeedsClamp ? <div className="profile-refresh" role="status">正在返回有效页码…</div> : state.data?.length ? (
        <section className="collection-library-shelf" aria-labelledby="my-collection-library-title"><header><div><p>PERSONAL ARCHIVE / {String(page).padStart(2, "0")}</p><h2 id="my-collection-library-title">参与的册页</h2></div><span>创建与共同维护</span></header><div className="collection-library-grid">
          {state.data.map((collection, index) => <CollectionCard key={collection.id} collection={collection} index={(page - 1) * PAGE_SIZE + index} variant={index === 0 ? "featured" : "catalogue"} />)}
        </div></section>
      ) : <EmptyState title="还没有参与 Collection" description="创建一个合集，或等待朋友邀请你加入共同记录。" />}
      <Pagination
        page={pagination.page || page}
        totalPages={pagination.total_pages || 0}
        disabled={pageNeedsClamp}
        onChange={(nextPage) => setParams(nextPage === 1 ? {} : { page: String(nextPage) })}
      />
    </main>
  );
}
