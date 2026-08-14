import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { TaxonomyNav } from "../components/TaxonomyNav";
import { EmptyState, ErrorState, PageLoader } from "../components/States";

const CONFIG = {
  category: {
    title: "Categories",
    description: "按编辑分类阅读文章；数量只包含你当前有权访问的内容。",
    endpoint: "/categories",
    path: "/categories",
    emptyTitle: "还没有可见 Category",
    emptyDescription: "Category 只有在包含你有权阅读的文章时才会出现在这里。",
  },
  tag: {
    title: "Tags",
    description: "沿着标签浏览文章与随记；所有计数均已先应用内容权限。",
    endpoint: "/tags",
    path: "/tags",
    emptyTitle: "还没有可见 Tag",
    emptyDescription: "Tag 只有在关联你有权阅读的内容时才会出现在这里。",
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

  return (
    <main className="page-shell taxonomy-page">
      <TaxonomyNav />
      <header className="page-heading taxonomy-heading">
        <div>
          <h1>{config.title}</h1>
          <p>{config.description}</p>
        </div>
        <span className="taxonomy-total tabular">{items.length} 个可见{kind === "category" ? "分类" : "标签"}</span>
      </header>

      {items.length ? (
        <div className={`taxonomy-grid taxonomy-grid-${kind}`}>
          {items.map((item) => (
            <article className="taxonomy-card" key={item.id}>
              <div className="taxonomy-card-meta">
                <span>{kind === "category" ? "Category" : "Tag"}</span>
                <span className="tabular">{item.visible_post_count || 0} 篇</span>
              </div>
              <h2>
                <Link to={`${config.path}/${item.slug}`}>
                  {kind === "tag" ? "#" : ""}{item.name}
                </Link>
              </h2>
              {kind === "category" ? (
                item.description
                  ? <p>{item.description}</p>
                  : <p className="muted">还没有填写分类说明。</p>
              ) : (
                <p className="muted">查看这个标签下你有权阅读的内容。</p>
              )}
              <Link className="taxonomy-card-link" to={`${config.path}/${item.slug}`}>浏览内容</Link>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title={config.emptyTitle} description={config.emptyDescription} />
      )}
    </main>
  );
}
