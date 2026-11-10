import { useBrowseReturn } from "../hooks/useBrowseReturn";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { useFlipList } from "../hooks/useFlipList";
import { CollectionCard } from "../components/CollectionCard";
import { CollectionIntro } from "../components/CollectionIntro";
import { CustomSelect } from "../components/CustomSelect";
import { EmptyState, ErrorState, PageLoader } from "../components/States";
import { Pagination } from "../components/Pagination";
import { clampPageToTotal } from "../lib/pagination";
import { CollectionSketch } from "../components/CollectionSketch";
import "../styles/collections-editorial.css";

const PAGE_SIZE = 20;
const SEARCH_DELAY = 320;
const ROLES = [["", "全部", "all"], ["created", "我创建的", "created"], ["joined", "我参与的", "joined"]];
// 筛掉的书被从书架上取走，新进来的从下方放上架。
const BOOK_EXIT = [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-28px) rotate(-2deg)" }];
const BOOK_ENTER = [{ opacity: 0, transform: "translateY(18px)" }, { opacity: 1, transform: "none" }];

export function CollectionsPage() {
  usePageMeta("合集");
  const [params, setParams] = useSearchParams();
  const parsedPage = Number.parseInt(params.get("page") || "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const query = params.get("q") || "";
  const role = params.get("role") || "";
  const member = params.get("member") || "";
  const [searchValue, setSearchValue] = useState(query);
  const [introId, setIntroId] = useState(null);
  const searchTimer = useRef(0);
  const track = useRef(null);

  const request = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
  if (query) request.set("q", query);
  if (role) request.set("role", role);
  if (member) request.set("member", member);
  const requestPath = `/collections?${request}`;
  const state = useAsyncData(() => api.get(requestPath), [requestPath], { keepPrevious: true });
  useBrowseReturn(!state.loading && !state.error);
  const pagination = state.meta?.pagination || {};
  const filters = state.meta?.filters;
  const clampedPage = clampPageToTotal(page, pagination.total || 0, pagination.page_size || PAGE_SIZE);
  const pageNeedsClamp = !state.loading && Boolean(state.meta) && clampedPage !== page;
  const collections = state.data || [];
  const filtered = Boolean(query || role || member);
  useFlipList(track, collections.map((item) => item.id).join(","), { exit: BOOK_EXIT, enter: BOOK_ENTER });

  // 函数式更新：搜索的延时提交不会用旧的筛选条件覆盖刚点过的标签。
  const updateParams = (updates) => setParams((current) => {
    const next = new URLSearchParams(current);
    Object.entries(updates).forEach(([key, value]) => {
      if (value) next.set(key, String(value));
      else next.delete(key);
    });
    return next;
  });

  useEffect(() => setSearchValue(query), [query]);
  useEffect(() => () => window.clearTimeout(searchTimer.current), []);
  useEffect(() => {
    if (!pageNeedsClamp) return;
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (clampedPage === 1) next.delete("page");
      else next.set("page", String(clampedPage));
      return next;
    }, { replace: true });
  }, [clampedPage, pageNeedsClamp, setParams]);

  const search = (value) => {
    setSearchValue(value);
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => updateParams({ q: value.trim(), page: "" }), SEARCH_DELAY);
  };

  if (state.loading && !state.data) return <PageLoader />;
  if (state.error) return <main className="page-shell"><ErrorState error={state.error} onRetry={state.reload} /></main>;

  const introIndex = collections.findIndex((item) => item.id === introId);
  const libraryTotal = filters?.all ?? pagination.total ?? 0;

  return (
    <main className="page-shell collection-library-page collection-library-page-editorial" aria-busy={state.loading || pageNeedsClamp || undefined}>
      <header className="collection-library-hero collection-library-hero-editorial">
        <div className="collection-library-copy">
          <p className="hero-kicker"></p>
          <h1>合集<br /></h1>
          <p>你创建或参与的合集。</p>
        </div>
        <div className="collection-library-drawing"><p aria-hidden="true"><br /><span></span></p><CollectionSketch /></div>
        <aside className="collection-library-index" aria-label="合集目录概览">
          <span className="tabular">{libraryTotal}</span>
          <div><strong>册合集</strong><p></p></div>
          <Link className="btn btn-primary" to="/collections/new">创建合集</Link>
        </aside>
      </header>
      {pageNeedsClamp
        ? <div className="profile-refresh" role="status">正在返回有效页码…</div>
        : libraryTotal
        ? <section className={`collection-library-shelf${state.loading ? " is-refreshing" : ""}`} aria-labelledby="collection-library-title">
            <header><div><p>第 {String(page).padStart(2, "0")} 页</p><h2 id="collection-library-title">合集目录</h2></div><span>按最近更新时间排列</span></header>
            {libraryTotal > 1 ? <div className="collection-shelf-filters" role="search" aria-label="筛选合集">
              <label className="collection-shelf-search">
                <span className="sr-only">按名称或简介找合集</span>
                <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4.5 4.5" /></svg>
                <input type="search" value={searchValue} maxLength={80} placeholder="找一册合集" onChange={(event) => search(event.target.value)} />
              </label>
              <div className="filter-tabs collection-shelf-roles" role="group" aria-label="按身份筛选">
                {ROLES.map(([value, label, key]) => <button key={value || "all"} type="button" className={role === value ? "active" : ""} aria-pressed={role === value} onClick={() => updateParams({ role: value, page: "" })}>
                  {label}<span className="tabular">{filters?.[key] ?? ""}</span>
                </button>)}
              </div>
              {filters?.members?.length ? <CustomSelect aria-label="和谁一起" className="collection-shelf-member" value={member} onChange={(event) => updateParams({ member: event.target.value, page: "" })}>
                <option value="">和谁一起：所有人</option>
                {filters.members.map((person) => <option key={person.username} value={person.username}>{person.nickname}（{person.count} 册）</option>)}
              </CustomSelect> : null}
            </div> : null}
            {collections.length ? <div className="collection-bookshelf" aria-label="合集书架">
              <div ref={track} className="collection-bookshelf-track">
                {collections.map((item, index) => <CollectionCard key={item.id} collection={item} index={(page - 1) * PAGE_SIZE + index} variant="shelf" onOpen={(collection) => setIntroId(collection.id)} />)}
              </div>
            </div> : <EmptyState
              title={filtered ? "这一格书架是空的" : "还没有合集"}
              description={filtered ? "换个名字或筛选条件，或者看看全部合集。" : "创建一个合集，或请朋友邀请你加入。"}
              action={filtered ? <button className="btn btn-secondary" type="button" onClick={() => { setSearchValue(""); updateParams({ q: "", role: "", member: "", page: "" }); }}>清除筛选</button> : null}
            />}
          </section>
        : <EmptyState illustrated title="还没有合集" description="创建一个合集，或请朋友邀请你加入。" />}
      <Pagination
        page={pagination.page || page}
        totalPages={pagination.total_pages || 1}
        disabled={pageNeedsClamp}
        onChange={(nextPage) => updateParams({ page: nextPage === 1 ? "" : nextPage })}
      />
      {introIndex >= 0 ? <CollectionIntro
        collections={collections}
        index={introIndex}
        volumeOffset={(page - 1) * PAGE_SIZE}
        onIndex={(next) => setIntroId(collections[next].id)}
        onClose={() => setIntroId(null)}
      /> : null}
    </main>
  );
}
