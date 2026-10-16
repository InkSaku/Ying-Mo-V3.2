import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { TaxonomyNav } from "../components/TaxonomyNav";
import { EmptyState, ErrorState, PageLoader } from "../components/States";
import { summarizeTaxonomyItems, taxonomyTagProminence } from "../lib/taxonomy";
import { TaxonomySketch } from "../components/TaxonomySketch";
import "../styles/taxonomy-editorial.css";

const CONFIG = {
  category: {
    title: "分类",
    description: "按分类浏览文章。",
    endpoint: "/categories",
    path: "/categories",
    itemLabel: "分类",
    sectionTitle: "全部分类",
    sectionDescription: "按分类顺序排列。",
    emptyTitle: "暂无可查看的分类",
    emptyDescription: "",
  },
  tag: {
    title: "标签",
    description: "按标签浏览文章与随记。",
    endpoint: "/tags",
    path: "/tags",
    itemLabel: "标签",
    sectionTitle: "全部标签",
    sectionDescription: "",
    emptyTitle: "暂无可查看的标签",
    emptyDescription: "",
  },
};

export function TaxonomyIndexPage({ kind }) {
  const [query, setQuery] = useState("");
  const config = CONFIG[kind];
  usePageMeta(config.title);
  const state = useAsyncData(() => api.get(config.endpoint), [config.endpoint]);

  if (state.loading) return <PageLoader label={`正在读取 ${config.title}`} />;
  if (state.error) {
    return <main className="page-shell"><ErrorState error={state.error} onRetry={state.reload} /></main>;
  }

  const items = state.data || [];
  const displayedItems = kind === "tag" ? items.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase())) : items;
  const summary = summarizeTaxonomyItems(items);

  return (
    <main className={`page-shell taxonomy-page taxonomy-publication-page taxonomy-index-${kind}`}>
      <TaxonomyNav />
      <header className="taxonomy-index-hero">
        <div className="taxonomy-index-copy">
          <span className="taxonomy-kicker">{kind === "category" ? "" : ""}</span>
          <h1>{config.title}</h1>
          <p>{config.description}</p>
        </div>
        <TaxonomySketch kind={kind} />
        <dl className="taxonomy-index-facts">
          <div><dt>目录条目</dt><dd className="tabular">{summary.itemCount}</dd></div>
          <div><dt>可读内容</dt><dd className="tabular">{summary.postCount}</dd></div>
          <div><dt>排列方式</dt><dd>{kind === "category" ? "分类顺序" : "标签频次"}</dd></div>
        </dl>
      </header>

      {kind === "tag" ? <label className="taxonomy-topic-search"><span aria-hidden="true">#</span><input aria-label="搜索标签" placeholder="搜索标签名称，例如「旅行」" value={query} maxLength={80} onChange={(event) => setQuery(event.target.value)} /></label> : null}

      {items.length ? (
        <section className="taxonomy-register" aria-labelledby="taxonomy-register-title">
          <header className="taxonomy-register-heading">
            <span>{kind === "category" ? "CONTENTS" : "KEYWORDS"}</span>
            <h2 id="taxonomy-register-title">{config.sectionTitle}</h2>
            <p>{config.sectionDescription}</p>
          </header>
          {kind === "category" ? (
            <ol className="taxonomy-category-register">
              {items.map((item, index) => (
                <li key={item.id}>
                  <Link to={`${config.path}/${item.slug}`}>
                    <span className="taxonomy-register-order tabular" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                    <span className="taxonomy-category-copy">
                      <strong>{item.name}</strong>
                      <small>{item.description || ""}</small>
                    </span>
                    <span className="taxonomy-register-count"><b className="tabular">{item.visible_post_count || 0}</b><small>篇文章</small></span>
                    <span className="taxonomy-register-action">查看分类</span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <div className="taxonomy-tag-register">
              {displayedItems.map((item) => (
                <Link
                  className={`taxonomy-tag-entry is-${taxonomyTagProminence(item, summary.maxCount)}`}
                  key={item.id}
                  to={`${config.path}/${item.slug}`}
                >
                  <strong>#{item.name}</strong>
                  <span className="tabular">{item.visible_post_count || 0} 则</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      ) : (
        <EmptyState title={config.emptyTitle} description={config.emptyDescription} />
      )}
      {kind === "tag" && items.length > 0 && !displayedItems.length ? <EmptyState title="没有找到这个标签" description="试试其他关键词。" /> : null}
    </main>
  );
}
