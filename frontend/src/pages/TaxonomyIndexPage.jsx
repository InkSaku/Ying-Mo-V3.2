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
    title: "栏目目录",
    description: "按长期主题整理文章，像翻阅刊物目录一样找到连续阅读的入口。",
    endpoint: "/categories",
    path: "/categories",
    itemLabel: "栏目",
    sectionTitle: "全部栏目",
    sectionDescription: "栏目按编辑顺序排列，收录数量只计算你有权阅读的文章。",
    emptyTitle: "还没有可见栏目",
    emptyDescription: "栏目只有在包含你有权阅读的文章时才会出现在这里。",
  },
  tag: {
    title: "主题索引",
    description: "沿着关键词串联文章与随记，让分散的片段形成新的阅读路径。",
    endpoint: "/tags",
    path: "/tags",
    itemLabel: "主题",
    sectionTitle: "全部主题",
    sectionDescription: "出现越频繁的主题拥有更清晰的字级，计数已应用内容权限。",
    emptyTitle: "还没有可见主题",
    emptyDescription: "主题只有在关联你有权阅读的内容时才会出现在这里。",
  },
};

export function TaxonomyIndexPage({ kind }) {
  const config = CONFIG[kind];
  usePageMeta(config.title);
  const state = useAsyncData(() => api.get(config.endpoint), [config.endpoint]);

  if (state.loading) return <PageLoader label={`正在读取 ${config.title}`} />;
  if (state.error) {
    return <main className="page-shell"><ErrorState error={state.error} onRetry={state.reload} /></main>;
  }

  const items = state.data || [];
  const summary = summarizeTaxonomyItems(items);

  return (
    <main className={`page-shell taxonomy-page taxonomy-publication-page taxonomy-index-${kind}`}>
      <TaxonomyNav />
      <header className="taxonomy-index-hero">
        <div className="taxonomy-index-copy">
          <span className="taxonomy-kicker">{kind === "category" ? "CATEGORIES / 栏目" : "TAGS / 主题"}</span>
          <h1>{config.title}</h1>
          <p>{config.description}</p>
        </div>
        <TaxonomySketch kind={kind} />
        <dl className="taxonomy-index-facts">
          <div><dt>目录条目</dt><dd className="tabular">{summary.itemCount}</dd></div>
          <div><dt>可读内容</dt><dd className="tabular">{summary.postCount}</dd></div>
          <div><dt>编排方式</dt><dd>{kind === "category" ? "编辑顺序" : "主题频次"}</dd></div>
        </dl>
      </header>

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
                      <small>{item.description || "这个栏目暂未填写说明。"}</small>
                    </span>
                    <span className="taxonomy-register-count"><b className="tabular">{item.visible_post_count || 0}</b><small>篇文章</small></span>
                    <span className="taxonomy-register-action">进入栏目</span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <div className="taxonomy-tag-register">
              {items.map((item) => (
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
    </main>
  );
}
