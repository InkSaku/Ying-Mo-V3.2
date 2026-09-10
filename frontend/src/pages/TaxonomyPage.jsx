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
import { summarizeTaxonomyPosts } from "../lib/taxonomy";
import { TaxonomySketch } from "../components/TaxonomySketch";
import "../styles/taxonomy-editorial.css";

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
  const label = isCategory ? "栏目" : "主题";
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
  const mix = summarizeTaxonomyPosts(posts);
  const firstIndex = (Math.max(1, pagination.page || page) - 1) * (pagination.page_size || PAGE_SIZE);
  const mixLabel = [
    mix.articles ? `${mix.articles} 篇文章` : "",
    mix.notes ? `${mix.notes} 则随记` : "",
  ].filter(Boolean).join("，") || "暂无内容";

  return (
    <main className={`page-shell taxonomy-page taxonomy-publication-page taxonomy-detail-${kind}`} aria-busy={pageNeedsClamp || undefined}>
      <TaxonomyNav />
      <header className="taxonomy-detail-hero">
        <p className="taxonomy-back"><Link to={basePath}>返回{isCategory ? "栏目目录" : "主题索引"}</Link></p>
        <div className="taxonomy-detail-hero-layout">
          <div className="taxonomy-detail-copy">
            <span className="taxonomy-detail-kind">{label}</span>
          <h1>{isCategory ? "" : "#"}{taxonomy?.name || slug}</h1>
          {isCategory && taxonomy?.description ? (
            <p>{taxonomy.description}</p>
          ) : (
              <p>{isCategory ? "这个栏目暂未填写说明。" : "从同一个关键词出发，重读彼此关联的文章与随记。"}</p>
          )}
          </div>
          <TaxonomySketch kind={kind} />
          <dl className="taxonomy-detail-facts">
            <div><dt>可读内容</dt><dd className="tabular">{count}</dd></div>
            <div><dt>当前页</dt><dd className="tabular">{posts.length}</dd></div>
            <div><dt>内容构成</dt><dd>{mixLabel}</dd></div>
          </dl>
        </div>
      </header>

      <section className="taxonomy-reading-section" aria-labelledby="taxonomy-reading-title">
        <header className="taxonomy-reading-heading">
          <h2 id="taxonomy-reading-title">{isCategory ? "栏目文章" : "主题阅读"}</h2>
          <p>{isCategory ? "沿着发布时间依次阅读这个栏目。" : "文章与随记按时间交错排列，保留主题形成的自然路径。"}</p>
        </header>
        <div className="taxonomy-reading-body">
          <aside className="taxonomy-reading-summary" aria-label="当前阅读范围">
            <dl>
              <div><dt>总计</dt><dd className="tabular">{count}</dd></div>
              <div><dt>页码</dt><dd className="tabular">{pagination.page || page} / {Math.max(1, totalPages)}</dd></div>
              <div><dt>本页</dt><dd>{mixLabel}</dd></div>
            </dl>
          </aside>
          <div className="taxonomy-reading-results">
            {pageNeedsClamp ? <div className="profile-refresh" role="status">正在返回有效页码…</div> : posts.length ? (
              <div className="taxonomy-reading-list">
                {posts.map((post, index) => (
                  <div className="taxonomy-reading-entry" key={post.id}>
                    <span className="taxonomy-reading-number tabular" aria-hidden="true">{String(firstIndex + index + 1).padStart(2, "0")}</span>
                    <PostCard post={post} compact />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title={`这个${label}下还没有可见内容`}
                description="内容可能尚未发布，或不在你当前有权进入的合集里。"
              />
            )}
          </div>
        </div>
      </section>

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
