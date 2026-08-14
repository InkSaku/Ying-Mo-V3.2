import { useEffect } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { PostCard } from "../components/PostCard";
import { Pagination } from "../components/Pagination";
import { TaxonomyNav } from "../components/TaxonomyNav";
import { EmptyState, ErrorState, PageLoader } from "../components/States";
import { clampPageToTotal } from "../lib/pagination";

const PAGE_SIZE = 20;

function cleanPage(value) {
  const parsed = Number.parseInt(value || "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function TaxonomyPage({ kind }) {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const page = cleanPage(params.get("page"));
  const isCategory = kind === "category";
  const label = isCategory ? "Category" : "Tag";
  const basePath = isCategory ? "/categories" : "/tags";
  const state = useAsyncData(
    () => api.get(`${basePath}/${encodeURIComponent(slug)}?page=${page}&page_size=${PAGE_SIZE}`),
    [basePath, page, slug]
  );
  const taxonomy = state.data?.[kind] || null;
  const pagination = state.meta?.pagination || {};
  const totalPages = pagination.total_pages || 0;
  const clampedPage = clampPageToTotal(page, pagination.total || 0, pagination.page_size || PAGE_SIZE);
  const pageNeedsClamp = Boolean(state.meta) && clampedPage !== page;
  usePageMeta(taxonomy ? `${label}：${taxonomy.name}` : label);

  useEffect(() => {
    if (pageNeedsClamp) {
      setParams(clampedPage === 1 ? {} : { page: String(clampedPage) }, { replace: true });
    }
  }, [clampedPage, pageNeedsClamp, setParams]);

  if (state.loading) return <PageLoader label={`正在读取 ${label}`} />;
  if (state.error) {
    return <main className="page-shell"><ErrorState error={state.error} onRetry={state.reload} /></main>;
  }

  const posts = state.data?.posts || [];
  const count = state.data?.visible_post_count ?? pagination.total ?? 0;

  return (
    <main className="page-shell taxonomy-page" aria-busy={pageNeedsClamp || undefined}>
      <TaxonomyNav />
      <p className="taxonomy-back"><Link to={basePath}>← 返回全部 {label}</Link></p>
      <header className="page-heading taxonomy-detail-heading">
        <div>
          <span className="eyebrow">{label}</span>
          <h1>{isCategory ? "" : "#"}{taxonomy?.name || slug}</h1>
          {isCategory && taxonomy?.description ? (
            <p>{taxonomy.description}</p>
          ) : (
            <p>这里只展示你当前有权访问的内容。</p>
          )}
        </div>
        <div className="taxonomy-count">
          <strong className="tabular">{count}</strong>
          <span>篇可见内容</span>
        </div>
      </header>

      {pageNeedsClamp ? <div className="profile-refresh" role="status">正在返回有效页码…</div> : posts.length ? (
        <div className="note-stream">
          {posts.map((post) => <PostCard key={post.id} post={post} compact />)}
        </div>
      ) : (
        <EmptyState
          title={`这个 ${label} 下还没有可见内容`}
          description="内容可能尚未发布，或不在你当前有权进入的 Collection 中。"
        />
      )}

      <Pagination
        page={pagination.page || page}
        totalPages={totalPages}
        disabled={pageNeedsClamp}
        onChange={(nextPage) => {
          setParams(nextPage === 1 ? {} : { page: String(nextPage) });
          const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
        }}
      />
    </main>
  );
}
