import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { PostCard } from "../components/PostCard";
import { CollectionCard } from "../components/CollectionCard";
import { Pagination } from "../components/Pagination";
import { EmptyState, ErrorState } from "../components/States";
import { clampPageToTotal } from "../lib/pagination";

const SUGGESTION_DELAY = 300;
const PAGE_SIZE = 20;

function cleanPage(value) {
  const parsed = Number.parseInt(value || "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function SearchPage() {
  usePageMeta("搜索");
  const [params, setParams] = useSearchParams();
  const q = (params.get("q") || "").trim();
  const page = cleanPage(params.get("page"));
  const [inputValue, setInputValue] = useState(q);
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
      setParams(clampedPage === 1 ? { q } : { q, page: String(clampedPage) }, { replace: true });
    }
  }, [clampedPage, pageNeedsClamp, q, setParams]);

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
  const hasResults = Boolean(data && (
    data.posts?.length || data.collections?.length || data.users?.length ||
    data.category_facets?.length || data.tag_facets?.length
  ));
  const showSuggestionPanel = suggestionOpen && Boolean(suggestionTerm);

  return (
    <main className="page-shell" aria-busy={state.loading || pageNeedsClamp || undefined}>
      <header className="page-heading search-heading">
        <div>
          <h1>搜索</h1>
          <p>搜索结果只来自你当前有权访问的内容空间。</p>
        </div>
      </header>

      <form
        className="search-form"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          runSearch(inputValue);
        }}
      >
        <label htmlFor="global-search">关键词</label>
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
              name="q"
              type="search"
              value={inputValue}
              maxLength={100}
              placeholder="标题、正文、Collection 或成员"
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
                          <span>{item.kind === "post" ? "Post" : "Collection"}</span>
                          {item.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
          <button className="btn btn-primary" type="submit">搜索</button>
        </div>
      </form>

      {!q ? <EmptyState title="输入关键词开始搜索" description="不会跨越 Collection ACL 展示无权内容。" /> : null}
      {q && state.loading ? <div className="search-loading" role="status">正在搜索“{q}”…</div> : null}
      {state.error ? <ErrorState error={state.error} onRetry={state.reload} /> : null}
      {pageNeedsClamp ? <div className="profile-refresh" role="status">正在返回有效页码…</div> : null}
      {q && !state.loading && !state.error && !pageNeedsClamp && !hasResults ? <EmptyState title="没有找到匹配内容" description="可以尝试更短或更具体的关键词。" /> : null}

      {!state.loading && !state.error && !pageNeedsClamp && data?.posts?.length ? (
        <section className="content-section" aria-labelledby="search-posts-heading">
          <div className="search-section-heading">
            <h2 id="search-posts-heading">Posts</h2>
            <span>{pagination.total || data.posts.length} 条内容</span>
          </div>
          <div className="note-stream">{data.posts.map((post) => <PostCard key={post.id} post={post} compact />)}</div>
          <Pagination page={pagination.page || page} totalPages={totalPages} disabled={pageNeedsClamp} onChange={(nextPage) => {
            setParams(nextPage === 1 ? { q } : { q, page: String(nextPage) });
            const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
          }} />
        </section>
      ) : null}

      {!state.loading && !state.error && !pageNeedsClamp && data?.collections?.length ? (
        <section className="content-section" aria-labelledby="search-collections-heading">
          <h2 id="search-collections-heading">Collections</h2>
          <div className="collection-grid">{data.collections.map((item) => <CollectionCard key={item.id} collection={item} />)}</div>
        </section>
      ) : null}

      {!state.loading && !state.error && !pageNeedsClamp && data?.users?.length ? (
        <section className="content-section" aria-labelledby="search-users-heading">
          <h2 id="search-users-heading">Users</h2>
          <div className="member-list search-members">
            {data.users.map((user) => <Link key={user.id} to={`/users/${user.username}`}>{user.nickname} <span>@{user.username}</span></Link>)}
          </div>
        </section>
      ) : null}

      {!state.loading && !state.error && !pageNeedsClamp && data?.category_facets?.length ? (
        <section className="content-section facet-section" aria-labelledby="search-categories-heading">
          <h2 id="search-categories-heading">Categories</h2>
          <div className="tag-cloud">
            {data.category_facets.map((item) => <Link className="tag" key={item.id} to={`/categories/${item.slug}`}>{item.name} ({item.count})</Link>)}
          </div>
        </section>
      ) : null}

      {!state.loading && !state.error && !pageNeedsClamp && data?.tag_facets?.length ? (
        <section className="content-section facet-section" aria-labelledby="search-tags-heading">
          <h2 id="search-tags-heading">Tags</h2>
          <div className="tag-cloud">
            {data.tag_facets.map((item) => <Link className="tag" key={item.id} to={`/tags/${item.slug}`}>#{item.name} ({item.count})</Link>)}
          </div>
        </section>
      ) : null}
    </main>
  );
}
