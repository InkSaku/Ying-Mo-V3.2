import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { PostCard } from "../components/PostCard";
import { Pagination } from "../components/Pagination";
import { EmptyState, ErrorState, PageLoader } from "../components/States";
import {
  archiveApiPath,
  archiveRangeLabel,
  archiveSearchParams,
  groupArchiveFacets,
  readArchiveSelection,
} from "../lib/archive";
import { clampPageToTotal } from "../lib/pagination";
import { PostFilters } from "../components/PostFilters";

const PAGE_SIZE = 20;

export function ArchivePage() {
  usePageMeta("归档");
  const [params, setParams] = useSearchParams();
  const selection = readArchiveSelection(params);
  const { year, month, page } = selection;
  const canonicalParams = archiveSearchParams(selection).toString();
  const path = archiveApiPath(selection, PAGE_SIZE);
  const state = useAsyncData(() => api.get(path), [path]);
  const optionState = useAsyncData(() => api.get("/posts/filter-options"), []);
  const pagination = state.meta?.pagination || {};
  const total = pagination.total || 0;
  const totalPages = pagination.total_pages || 0;
  const clampedPage = clampPageToTotal(page, total, pagination.page_size || PAGE_SIZE);
  const pageNeedsClamp = Boolean(state.data) && clampedPage !== page;
  const groups = useMemo(() => groupArchiveFacets(state.data?.month_facets), [state.data?.month_facets]);

  useEffect(() => {
    if (params.toString() !== canonicalParams) {
      setParams(canonicalParams, { replace: true });
    }
  }, [canonicalParams, params, setParams]);

  useEffect(() => {
    if (pageNeedsClamp) {
      setParams(archiveSearchParams({ ...selection, page: clampedPage }), { replace: true });
    }
  }, [clampedPage, pageNeedsClamp, selection, setParams]);

  const selectRange = (nextYear = "", nextMonth = "") => {
    setParams(archiveSearchParams({ ...selection, year: nextYear, month: nextMonth, page: 1 }));
  };
  const changeFilter = (key, value) => setParams(archiveSearchParams({ ...selection, [key]: value, page: 1 }));

  if (state.loading && !state.data) return <PageLoader label="正在整理归档" />;
  if (state.error) return <main className="page-shell"><ErrorState error={state.error} onRetry={state.reload} /></main>;

  const data = state.data || { items: [], month_facets: [] };
  return (
    <main className="page-shell" aria-busy={state.loading || pageNeedsClamp || undefined}>
      <header className="page-heading">
        <div>
          <h1>归档</h1>
          <p>Article 使用发布时间，Note 优先使用记录发生时间。</p>
        </div>
      </header>

      <PostFilters filters={{ ...selection, sort: "newest" }} options={optionState.data || {}} loading={optionState.loading} showSort={false} onChange={changeFilter} onClear={() => setParams(archiveSearchParams({ year, month, page: 1 }))} />

      <div className="archive-layout">
        <aside className="archive-facets" aria-label="归档年份与月份">
          <button
            className={!year ? "active" : ""}
            type="button"
            disabled={state.loading}
            aria-pressed={!year}
            onClick={() => selectRange()}
          >
            <span>全部</span>
            <span className="tabular">{groups.reduce((sum, group) => sum + group.count, 0)}</span>
          </button>
          {groups.map((group) => (
            <div className="archive-year-group" key={group.year}>
              <button
                className={String(group.year) === year && !month ? "active archive-year-button" : "archive-year-button"}
                type="button"
                disabled={state.loading}
                aria-pressed={String(group.year) === year && !month}
                onClick={() => selectRange(String(group.year))}
              >
                <span>{group.year} 年</span>
                <span className="tabular">{group.count}</span>
              </button>
              <div className="archive-month-list">
                {group.months.map((facet) => {
                  const active = String(facet.year) === year && String(facet.month) === month;
                  return (
                    <button
                      key={`${facet.year}-${facet.month}`}
                      className={active ? "active" : ""}
                      type="button"
                      disabled={state.loading}
                      aria-pressed={active}
                      onClick={() => selectRange(String(facet.year), String(facet.month))}
                    >
                      <span>{String(facet.month).padStart(2, "0")} 月</span>
                      <span className="tabular">{facet.count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </aside>

        <section className="archive-results" aria-labelledby="archive-range-title">
          <div className="section-heading archive-results-heading">
            <div>
              <h2 id="archive-range-title">{archiveRangeLabel(selection)}</h2>
              <p>{total} 条有权内容</p>
            </div>
            {state.loading ? <span className="profile-refresh" role="status">正在更新归档…</span> : null}
          </div>
          {pageNeedsClamp
            ? <div className="profile-refresh" role="status">正在返回有效页码…</div>
            : data.items?.length
            ? <div className="note-stream">{data.items.map((post) => <PostCard key={post.id} post={post} compact />)}</div>
            : <EmptyState title="这个时间范围没有内容" description="换一个月份，或返回全部归档。" />}
          <Pagination
            page={pagination.page || page}
            totalPages={totalPages}
            disabled={state.loading || pageNeedsClamp}
            onChange={(nextPage) => {
              setParams(archiveSearchParams({ ...selection, page: nextPage }));
            }}
          />
        </section>
      </div>
    </main>
  );
}
