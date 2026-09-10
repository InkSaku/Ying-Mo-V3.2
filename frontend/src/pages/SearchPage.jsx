import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { PostCard } from "../components/PostCard";
import { CollectionCard } from "../components/CollectionCard";
import { ProtectedImage } from "../components/ProtectedImage";
import { Pagination } from "../components/Pagination";
import { EmptyState, ErrorState } from "../components/States";
import { clampPageToTotal } from "../lib/pagination";
import { SearchSketch } from "../components/SearchSketch";
import "../styles/search-editorial.css";

const SUGGESTION_DELAY = 300;
const PAGE_SIZE = 20;
const RESULT_VIEWS = new Set(["all", "posts", "collections", "users"]);

function cleanPage(value) {
  const parsed = Number.parseInt(value || "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function SearchPage() {
  usePageMeta("搜索");
  const [params, setParams] = useSearchParams();
  const q = (params.get("q") || "").trim();
  const page = cleanPage(params.get("page"));
  const resultView = RESULT_VIEWS.has(params.get("type")) ? params.get("type") : "all";
  const [inputValue, setInputValue] = useState(q);
  const searchInputRef = useRef(null);
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [suggestionReload, setSuggestionReload] = useState(0);
  const [suggestionState, setSuggestionState] = useState({
    data: null,
    loading: false,
    error: null,
  });

  const state = useAsyncData(
    async () => q
      ? api.get(`/search?q=${encodeURIComponent(q)}&page=${page}&page_size=${PAGE_SIZE}`)
      : { data: null, meta: null },
    [q, page]
  );

  useEffect(() => {
    setInputValue(q);
  }, [q]);

  useEffect(() => {
    const focusSearch = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
        setSuggestionOpen(true);
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const suggestionTerm = inputValue.trim();
  useEffect(() => {
    if (!suggestionOpen || !suggestionTerm) {
      setSuggestionState({ data: null, loading: false, error: null });
      setActiveIndex(-1);
      return undefined;
    }

    const controller = new AbortController();
    let disposed = false;
    setSuggestionState((current) => ({ ...current, loading: true, error: null }));

    const timer = window.setTimeout(async () => {
      try {
        const result = await api.get(
          `/search/suggestions?q=${encodeURIComponent(suggestionTerm)}`,
          { signal: controller.signal }
        );
        if (!disposed) {
          setSuggestionState({ data: result.data, loading: false, error: null });
          setActiveIndex(-1);
        }
      } catch (error) {
        if (!disposed && error?.code !== "REQUEST_ABORTED") {
          setSuggestionState({ data: null, loading: false, error });
          setActiveIndex(-1);
        }
      }
    }, SUGGESTION_DELAY);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [suggestionOpen, suggestionTerm, suggestionReload]);

  const suggestions = useMemo(() => {
    const postTitles = suggestionState.data?.post_titles || [];
    const collectionNames = suggestionState.data?.collection_names || [];
    return [
      ...postTitles.map((label) => ({ kind: "post", label })),
      ...collectionNames.map((label) => ({ kind: "collection", label })),
    ];
  }, [suggestionState.data]);

  const pagination = state.meta?.pagination || {};
  const totalPages = pagination.total_pages || 0;
  const clampedPage = clampPageToTotal(page, pagination.total || 0, pagination.page_size || PAGE_SIZE);
  const pageNeedsClamp = Boolean(q && state.meta) && clampedPage !== page;

  useEffect(() => {
    if (pageNeedsClamp) {
      const nextParams = { q };
      if (clampedPage !== 1) nextParams.page = String(clampedPage);
      if (resultView !== "all") nextParams.type = resultView;
      setParams(nextParams, { replace: true });
    }
  }, [clampedPage, pageNeedsClamp, q, resultView, setParams]);

  const runSearch = (value) => {
    const nextQuery = value.trim();
    setSuggestionOpen(false);
    setActiveIndex(-1);
    setParams(nextQuery ? { q: nextQuery } : {});
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      setSuggestionOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!suggestionOpen || !suggestions.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      const selected = suggestions[activeIndex];
      setInputValue(selected.label);
      runSearch(selected.label);
    }
  };

  const data = state.data;
  const resultCounts = {
    posts: pagination.total || data?.posts?.length || 0,
    collections: data?.collections?.length || 0,
    users: data?.users?.length || 0,
  };
  const totalResultCount = resultCounts.posts + resultCounts.collections + resultCounts.users;
  const hasResults = Boolean(data && (
    data.posts?.length || data.collections?.length || data.users?.length ||
    data.category_facets?.length || data.tag_facets?.length
  ));
  const showSuggestionPanel = suggestionOpen && Boolean(suggestionTerm);
  const hasVisibleResults = resultView === "posts" ? Boolean(data?.posts?.length)
    : resultView === "collections" ? Boolean(data?.collections?.length)
      : resultView === "users" ? Boolean(data?.users?.length)
        : hasResults;

  const setResultView = (nextView) => {
    const nextParams = { q };
    if (nextView !== "all") nextParams.type = nextView;
    setParams(nextParams);
  };

  const resultTabs = [
    { id: "all", label: "全部", count: totalResultCount },
    { id: "posts", label: "文章与随记", count: resultCounts.posts },
    { id: "collections", label: "合集", count: resultCounts.collections },
    { id: "users", label: "成员", count: resultCounts.users },
  ];

  const renderCollections = (compact = false) => (
    <div className={compact ? "search-collection-list" : "collection-grid search-collection-grid"}>
      {data.collections.map((item, index) => compact ? (
        <Link className="search-collection-result" key={item.id} to={`/collections/${item.slug}`}>
          <ProtectedImage
            media={item.cover_media}
            alt=""
            className="search-collection-cover"
            fallback={<span className="search-collection-cover search-collection-cover-fallback" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>}
          />
          <span>
            <small>COLLECTION / {String(index + 1).padStart(2, "0")}</small>
            <strong>{item.name}</strong>
            <em>{item.description || "这一册还没有卷首说明。"}</em>
          </span>
          <i aria-hidden="true">↗</i>
        </Link>
      ) : <CollectionCard key={item.id} collection={item} variant="shelf" index={index} />)}
    </div>
  );

  const renderUsers = () => (
    <div className="search-member-list">
      {data.users.map((user) => {
        const label = user.nickname || user.username;
        return (
          <Link key={user.id} to={`/users/${user.username}`} className="search-member-result">
            <ProtectedImage
              media={user.avatar_media}
              alt=""
              className="search-member-avatar"
              fallback={<span className="search-member-avatar search-member-avatar-fallback" aria-hidden="true">{label.slice(0, 1)}</span>}
            />
            <span><strong>{label}</strong><small>@{user.username}</small></span>
            <i aria-hidden="true">↗</i>
          </Link>
        );
      })}
    </div>
  );

  const renderFacets = () => (
    data.category_facets?.length || data.tag_facets?.length ? (
      <section className="search-facet-panel" aria-labelledby="search-facets-heading">
        <div className="search-rail-heading">
          <span>RELATED INDEX</span>
          <h2 id="search-facets-heading">相关索引</h2>
        </div>
        {data.category_facets?.length ? (
          <div className="search-facet-group">
            <h3>分类</h3>
            <div className="search-facet-list">
              {data.category_facets.map((item) => <Link key={item.id} to={`/categories/${item.slug}`}><span>{item.name}</span><small>{item.count}</small></Link>)}
            </div>
          </div>
        ) : null}
        {data.tag_facets?.length ? (
          <div className="search-facet-group">
            <h3>标签</h3>
            <div className="tag-cloud search-tag-cloud">
              {data.tag_facets.map((item) => <Link className="tag" key={item.id} to={`/tags/${item.slug}`}>#{item.name} <small>{item.count}</small></Link>)}
            </div>
          </div>
        ) : null}
      </section>
    ) : null
  );

  return (
    <main className="page-shell search-page" aria-busy={state.loading || pageNeedsClamp || undefined}>
      <header className="search-hero">
        <div className="search-hero-copy">
          <span className="search-eyebrow">SEARCH / DISCOVERY</span>
          <h1>{q ? "继续寻找。" : "在共同记忆里，\n找到那一页。"}</h1>
          <p>从文章、随记、合集与成员中检索。结果始终遵循你当前拥有的访问权限。</p>
        </div>

        <SearchSketch />

        <form
        className="search-form search-hero-form"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          runSearch(inputValue);
        }}
      >
        <label htmlFor="global-search">搜索内容</label>
        <div className="search-form-row">
          <div
            className="search-combobox"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setSuggestionOpen(false);
                setActiveIndex(-1);
              }
            }}
          >
            <input
              id="global-search"
              ref={searchInputRef}
              name="q"
              type="search"
              value={inputValue}
              maxLength={100}
              placeholder="输入标题、正文、合集或成员…"
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showSuggestionPanel}
              aria-controls="search-suggestions"
              aria-activedescendant={activeIndex >= 0 ? `search-suggestion-${activeIndex}` : undefined}
              onFocus={() => setSuggestionOpen(true)}
              onChange={(event) => {
                setInputValue(event.target.value);
                setSuggestionOpen(true);
                setActiveIndex(-1);
              }}
              onKeyDown={handleKeyDown}
            />

            <span className="search-input-icon" aria-hidden="true">⌕</span>

            {showSuggestionPanel ? (
              <div id="search-suggestions" className="search-suggestions">
                {suggestionState.loading ? (
                  <p className="search-suggestion-state" role="status">正在寻找建议…</p>
                ) : null}
                {suggestionState.error ? (
                  <div className="search-suggestion-state" role="alert">
                    <p>{suggestionState.error.message || "搜索建议加载失败。"}</p>
                    <button className="text-button" type="button" onClick={() => setSuggestionReload((value) => value + 1)}>
                      重试
                    </button>
                  </div>
                ) : null}
                {!suggestionState.loading && !suggestionState.error && suggestionState.data && !suggestions.length ? (
                  <p className="search-suggestion-state">没有匹配的标题或 Collection。</p>
                ) : null}
                {!suggestionState.loading && !suggestionState.error && suggestions.length ? (
                  <ul className="search-suggestion-list" role="listbox" aria-label="搜索建议">
                    {suggestions.map((item, index) => (
                      <li
                        key={`${item.kind}-${item.label}`}
                        role="none"
                      >
                        <button
                          id={`search-suggestion-${index}`}
                          type="button"
                          role="option"
                          aria-selected={activeIndex === index}
                          className={activeIndex === index ? "active" : ""}
                          onMouseDown={(event) => event.preventDefault()}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => {
                            setInputValue(item.label);
                            runSearch(item.label);
                          }}
                        >
                          <span>{item.kind === "post" ? "内容" : "合集"}</span>
                          <strong>{item.label}</strong>
                          <i aria-hidden="true">↵</i>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
          <button className="btn btn-primary search-submit" type="submit">开始搜索 <span aria-hidden="true">→</span></button>
        </div>
        <p className="search-form-hint"><span>⌘ K</span> 支持标题与正文关键词，也可以直接搜索一个人的名字。</p>
        </form>
      </header>

      {!q ? (
        <section className="search-start" aria-labelledby="search-start-heading">
          <div className="search-start-heading">
            <span>HOW TO SEARCH</span>
            <h2 id="search-start-heading">你可以从这些线索开始</h2>
          </div>
          <div className="search-start-grid">
            <article><span>01</span><h3>一句话</h3><p>搜索标题、摘要和正文，找回只记得片段的那篇内容。</p></article>
            <article><span>02</span><h3>一本合集</h3><p>输入合集名称，回到一组共同维护、持续生长的记录。</p></article>
            <article><span>03</span><h3>一个人</h3><p>通过昵称或用户名，找到共同书写这段记忆的成员。</p></article>
          </div>
          <p className="search-privacy-note"><span aria-hidden="true">◉</span> 私密内容不会因为搜索而越过原有的访问边界。</p>
        </section>
      ) : null}
      {q && state.loading ? <div className="search-loading" role="status">正在搜索“{q}”…</div> : null}
      {state.error ? <ErrorState error={state.error} onRetry={state.reload} /> : null}
      {pageNeedsClamp ? <div className="profile-refresh" role="status">正在返回有效页码…</div> : null}
      {q && !state.loading && !state.error && !pageNeedsClamp && !hasResults ? (
        <div className="search-empty-result">
          <span aria-hidden="true">00</span>
          <div><h2>没有找到“{q}”</h2><p>试着减少关键词、换一种说法，或检查是否输入了完整的人名与合集名称。</p></div>
          <button className="text-button" type="button" onClick={() => { setInputValue(""); setParams({}); }}>重新搜索</button>
        </div>
      ) : null}

      {q && !state.loading && !state.error && !pageNeedsClamp && hasResults ? (
        <>
          <section className="search-result-overview" aria-labelledby="search-results-heading">
            <div>
              <span className="search-eyebrow">SEARCH RESULTS</span>
              <h2 id="search-results-heading">关于“{q}”</h2>
            </div>
            <p><strong>{totalResultCount}</strong><span>项可访问结果</span></p>
          </section>

          <nav className="search-result-tabs" aria-label="搜索结果类型">
            {resultTabs.map((tab) => (
              <button key={tab.id} type="button" className={resultView === tab.id ? "active" : ""} aria-pressed={resultView === tab.id} onClick={() => setResultView(tab.id)}>
                <span>{tab.label}</span><small>{String(tab.count).padStart(2, "0")}</small>
              </button>
            ))}
          </nav>

          {!hasVisibleResults ? (
            <EmptyState title={`“${resultTabs.find((tab) => tab.id === resultView)?.label}”中没有匹配内容`} description="可以切换到“全部”查看其他类型的结果。" action={<button className="text-button" type="button" onClick={() => setResultView("all")}>查看全部结果</button>} />
          ) : null}

          {hasVisibleResults && (resultView === "all" || resultView === "posts") ? (
            <div className={`search-results-layout ${resultView === "posts" ? "search-results-layout-wide" : ""} ${!data?.posts?.length ? "search-results-layout-secondary-only" : ""}`}>
              {data?.posts?.length ? (
                <section className="search-primary-results" aria-labelledby="search-posts-heading">
                  <div className="search-section-heading">
                    <div><span>WRITING / {String(resultCounts.posts).padStart(2, "0")}</span><h2 id="search-posts-heading">文章与随记</h2></div>
                    <p>按最近相关内容排序</p>
                  </div>
                  <div className="note-stream search-post-stream">{data.posts.map((post, index) => <PostCard key={post.id} post={post} compact variant="search" index={index} />)}</div>
                  <Pagination page={pagination.page || page} totalPages={totalPages} disabled={pageNeedsClamp} onChange={(nextPage) => {
                    const nextParams = { q };
                    if (nextPage !== 1) nextParams.page = String(nextPage);
                    if (resultView !== "all") nextParams.type = resultView;
                    setParams(nextParams);
                    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
                  }} />
                </section>
              ) : null}

              {resultView === "all" ? (
                <aside className="search-discovery-rail" aria-label="关联搜索结果">
                  {data?.collections?.length ? (
                    <section aria-labelledby="search-collections-heading">
                      <div className="search-rail-heading"><span>COLLECTIONS / {String(resultCounts.collections).padStart(2, "0")}</span><h2 id="search-collections-heading">相关合集</h2></div>
                      {renderCollections(true)}
                    </section>
                  ) : null}
                  {data?.users?.length ? (
                    <section aria-labelledby="search-users-heading">
                      <div className="search-rail-heading"><span>PEOPLE / {String(resultCounts.users).padStart(2, "0")}</span><h2 id="search-users-heading">相关成员</h2></div>
                      {renderUsers()}
                    </section>
                  ) : null}
                  {renderFacets()}
                </aside>
              ) : null}
            </div>
          ) : null}

          {hasVisibleResults && resultView === "collections" ? (
            <section className="search-filtered-section" aria-labelledby="search-collections-heading">
              <div className="search-section-heading"><div><span>COLLECTIONS / {String(resultCounts.collections).padStart(2, "0")}</span><h2 id="search-collections-heading">相关合集</h2></div><p>仅显示你可以进入的合集</p></div>
              {renderCollections(false)}
            </section>
          ) : null}

          {hasVisibleResults && resultView === "users" ? (
            <section className="search-filtered-section search-filtered-members" aria-labelledby="search-users-heading">
              <div className="search-section-heading"><div><span>PEOPLE / {String(resultCounts.users).padStart(2, "0")}</span><h2 id="search-users-heading">相关成员</h2></div><p>按昵称与用户名匹配</p></div>
              {renderUsers()}
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
