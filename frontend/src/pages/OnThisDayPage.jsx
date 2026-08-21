import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { clampPageToTotal } from "../lib/pagination";
import { cleanMemoryPage, groupMemories, memoryDayLabel } from "../lib/onThisDay";
import { MemoryCard } from "../components/MemoryCard";
import { Pagination } from "../components/Pagination";
import { EmptyState, ErrorState, PageLoader } from "../components/States";

const PAGE_SIZE = 20;

export function OnThisDayPage() {
  usePageMeta("往年今日");
  const [params, setParams] = useSearchParams();
  const page = cleanMemoryPage(params.get("page"));
  const state = useAsyncData(
    () => api.get(`/home/on-this-day?page=${page}&page_size=${PAGE_SIZE}`),
    [page]
  );
  const pagination = state.meta?.pagination || {};

  const goToPage = (nextPage) => {
    setParams(nextPage > 1 ? { page: String(nextPage) } : {});
  };

  useEffect(() => {
    if (state.loading || state.error || !state.meta) return;
    const nextPage = clampPageToTotal(page, pagination.total || 0, pagination.page_size || PAGE_SIZE);
    if (nextPage !== page) goToPage(nextPage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pagination.page_size, pagination.total, state.error, state.loading, state.meta]);

  if (state.loading && !state.data) return <PageLoader label="正在翻阅旧日记录" />;
  if (state.error) return <main className="page-shell"><ErrorState error={state.error} onRetry={state.reload} /></main>;

  const groups = groupMemories(state.data?.items);
  return (
    <main className="page-shell on-this-day-page" aria-busy={state.loading || undefined}>
      <header className="memory-hero">
        <div>
          <p className="hero-kicker">On this day</p>
          <h1>往年今日</h1>
          <p>{memoryDayLabel(state.data)}，看看朋友们曾在今天留下什么。</p>
        </div>
        <div className="memory-hero-date" aria-label={state.data?.date}>
          <span className="tabular">{String(state.data?.month || "").padStart(2, "0")}</span>
          <strong className="tabular">{String(state.data?.day || "").padStart(2, "0")}</strong>
        </div>
      </header>

      {state.data?.year_facets?.length ? (
        <div className="memory-year-summary" aria-label="包含的年份">
          {state.data.year_facets.map((facet) => (
            <span key={facet.year}>{facet.year} · {facet.count} 篇</span>
          ))}
        </div>
      ) : null}

      {state.loading ? <div className="profile-refresh" role="status">正在更新旧日记录…</div> : null}
      {groups.length ? groups.map((group) => (
        <section className="memory-year-section" key={group.year} aria-labelledby={`memory-year-${group.year}`}>
          <header>
            <p>{group.yearsAgo} 年前</p>
            <h2 id={`memory-year-${group.year}`} className="tabular">{group.year}</h2>
          </header>
          <div className="memory-grid">
            {group.items.map((post) => <MemoryCard key={post.id} post={post} />)}
          </div>
        </section>
      )) : (
        <EmptyState
          title="今天还没有旧日记录"
          description="只有往年同月同日、且你当前有权阅读的 Article 和 Note 会出现在这里。"
          action={<Link className="btn btn-secondary" to="/archive">去时间归档看看</Link>}
        />
      )}

      <Pagination
        page={pagination.page || page}
        totalPages={pagination.total_pages || 0}
        disabled={state.loading}
        onChange={goToPage}
      />
    </main>
  );
}
