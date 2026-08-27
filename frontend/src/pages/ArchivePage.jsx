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
  groupArchiveItems,
  readArchiveSelection,
} from "../lib/archive";
import { clampPageToTotal } from "../lib/pagination";
import { PostFilters } from "../components/PostFilters";

const PAGE_SIZE = 20;

function archiveDateParts(post) {
  const value =
    post?.post_type === "note"
      ? post?.semantic_time || post?.published_at
      : post?.published_at || post?.semantic_time;
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return { value: undefined, day: "--" };
  return { value, day: String(date.getDate()).padStart(2, "0") };
}

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
  const itemGroups = useMemo(() => groupArchiveItems(state.data?.items), [state.data?.items]);

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

  const activeYearGroup = groups.find((group) => String(group.year) === year);
  const archiveTotal = groups.reduce((sum, group) => sum + group.count, 0);
  return (
    <main className="page-shell archive-publication-page" aria-busy={state.loading || pageNeedsClamp || undefined}>
      <header className="archive-publication-hero">
        <div className="archive-publication-copy">
          <h1>归档</h1>
          <p>按年份和月份重读过往文章与随记，查看这份刊物持续生长的轨迹。</p>
        </div>
        <dl className="archive-publication-facts">
          <div><dt>当前范围</dt><dd>{archiveRangeLabel(selection)}</dd></div>
          <div><dt>可读记录</dt><dd className="tabular">{total}</dd></div>
          <div><dt>收录年份</dt><dd className="tabular">{groups.length}</dd></div>
        </dl>
      </header>

      <section className="archive-filter-shelf" aria-labelledby="archive-filter-title">
        <header><h2 id="archive-filter-title">查找归档</h2><p>可以继续按作者、分类、标签或合集缩小范围。</p></header>
        <PostFilters filters={{ ...selection, sort: "newest" }} options={optionState.data || {}} loading={optionState.loading} showSort={false} onChange={changeFilter} onClear={() => setParams(archiveSearchParams({ year, month, page: 1 }))} />
      </section>

      <div className="archive-layout">
        <aside className="archive-facets" aria-label="归档年份与月份">
          <header><h2>卷册索引</h2><p>选择年份后，可以继续定位到月份。</p></header>
          <div className="archive-year-list">
            <button
              className={!year ? "active" : ""}
              type="button"
              disabled={state.loading}
              aria-pressed={!year}
              onClick={() => selectRange()}
            >
              <span>全部年份</span>
              <span className="tabular">{archiveTotal}</span>
            </button>
            {groups.map((group) => (
              <button
                key={group.year}
                className={`${String(group.year) === year ? "current" : ""} ${String(group.year) === year && !month ? "active" : ""}`}
                type="button"
                disabled={state.loading}
                aria-pressed={String(group.year) === year && !month}
                onClick={() => selectRange(String(group.year))}
              >
                <span>{group.year} 年</span>
                <span className="tabular">{group.count}</span>
              </button>
            ))}
          </div>
          {activeYearGroup ? <section className="archive-month-index" aria-labelledby="archive-month-index-title">
            <h3 id="archive-month-index-title">{activeYearGroup.year} 年月份</h3>
            <div className="archive-month-list">
              {activeYearGroup.months.map((facet) => {
                const active = String(facet.month) === month;
                return <button key={`${facet.year}-${facet.month}`} className={active ? "active" : ""} type="button" disabled={state.loading} aria-pressed={active} onClick={() => selectRange(String(facet.year), String(facet.month))}><span>{String(facet.month).padStart(2, "0")} 月</span><span className="tabular">{facet.count}</span></button>;
              })}
            </div>
          </section> : null}
        </aside>

        <section className="archive-results" aria-labelledby="archive-range-title">
          <header className="archive-results-heading">
            <div>
              <h2 id="archive-range-title">{archiveRangeLabel(selection)}</h2>
              <p>共 {total} 则可阅读记录，当前页面按刊期整理。</p>
            </div>
            {state.loading ? <span className="profile-refresh" role="status">正在更新归档…</span> : null}
          </header>
          {pageNeedsClamp
            ? <div className="profile-refresh" role="status">正在返回有效页码…</div>
            : itemGroups.length
            ? <div className="archive-issue-list">{itemGroups.map((group) => <section key={group.key} className="archive-issue-group"><header><div><strong className="tabular">{group.year || "日期未定"}</strong>{group.month ? <span className="tabular">{String(group.month).padStart(2, "0")} 月</span> : null}</div><small>{group.items.length} 则</small></header><div>{group.items.map((post) => { const date = archiveDateParts(post); return <div className="archive-issue-entry" key={post.id}><time className="archive-entry-day tabular" dateTime={date.value}>{date.day}</time><PostCard post={post} compact /></div>; })}</div></section>)}</div>
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
