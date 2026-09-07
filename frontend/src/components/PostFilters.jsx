import { useState } from "react";
import { CustomSelect } from "./CustomSelect";

function FilterSelect({ label, value, options, valueKey, onChange, allLabel }) {
  return (
    <label>
      <span>{label}</span>
      <CustomSelect value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.id} value={option[valueKey]}>{option.nickname || option.name}</option>
        ))}
      </CustomSelect>
    </label>
  );
}

export function PostFilters({ type = "", filters, options = {}, loading = false, onChange, onClear, showSort = true, editorial = false }) {
  const isNote = type === "note";
  const activeCount = [filters.author, filters.category, filters.tag, filters.collection, filters.sort !== "newest" ? filters.sort : ""].filter(Boolean).length;
  const [filtersOpen, setFiltersOpen] = useState(false);

  const optionLabel = (items, value, valueKey) => items.find((item) => item[valueKey] === value)?.nickname
    || items.find((item) => item[valueKey] === value)?.name
    || value;
  const activeFilters = [
    filters.author ? { key: "author", label: `作者 · ${optionLabel(options.authors || [], filters.author, "username")}` } : null,
    !isNote && filters.category ? { key: "category", label: `分类 · ${optionLabel(options.categories || [], filters.category, "slug")}` } : null,
    filters.tag ? { key: "tag", label: `标签 · ${optionLabel(options.tags || [], filters.tag, "slug")}` } : null,
    filters.collection ? { key: "collection", label: `合集 · ${optionLabel(options.collections || [], filters.collection, "slug")}` } : null,
    filters.sort !== "newest" ? { key: "sort", label: `排序 · ${filters.sort === "oldest" ? (isNote ? "最早发生" : "最早发布") : "最近更新"}`, resetValue: "newest" } : null,
  ].filter(Boolean);

  const controls = <>
    <FilterSelect label="作者" value={filters.author} options={options.authors || []} valueKey="username" allLabel="全部作者" onChange={(value) => onChange("author", value)} />
    {!isNote ? <FilterSelect label="分类" value={filters.category} options={options.categories || []} valueKey="slug" allLabel="全部分类" onChange={(value) => onChange("category", value)} /> : null}
    <FilterSelect label="标签" value={filters.tag} options={options.tags || []} valueKey="slug" allLabel="全部标签" onChange={(value) => onChange("tag", value)} />
    <FilterSelect label="合集" value={filters.collection} options={options.collections || []} valueKey="slug" allLabel="全部合集" onChange={(value) => onChange("collection", value)} />
    {showSort ? (
      <label>
        <span>排序</span>
        <CustomSelect value={filters.sort} onChange={(event) => onChange("sort", event.target.value)}>
          <option value="newest">{isNote ? "最近发生" : "最新发布"}</option>
          <option value="oldest">{isNote ? "最早发生" : "最早发布"}</option>
          <option value="updated">最近更新</option>
        </CustomSelect>
      </label>
    ) : null}
    <button className="text-button post-filters-clear" type="button" onClick={onClear} disabled={!activeCount}>清除筛选</button>
  </>;

  if (!editorial) {
    return <section className="post-filters" aria-label="内容筛选" aria-busy={loading || undefined}>{controls}</section>;
  }

  if (!isNote) {
    const categories = options.categories || [];
    return (
      <section className="post-filters post-filters-editorial post-filters-article" aria-label="文章目录筛选" aria-busy={loading || undefined}>
        <div className="post-filters-index-line">
          <span>INDEX / FILTER</span>
          <nav aria-label="按分类筛选文章">
            <button className={!filters.category ? "is-active" : ""} type="button" onClick={() => onChange("category", "")}>全部</button>
            {categories.slice(0, 4).map((category) => <button className={filters.category === category.slug ? "is-active" : ""} key={category.id} type="button" onClick={() => onChange("category", category.slug)}>{category.name}</button>)}
          </nav>
          <button className="post-filters-drawer-toggle" type="button" aria-label={filtersOpen ? "收起筛选" : "展开筛选"} aria-expanded={filtersOpen} aria-controls="editorial-filter-controls" onClick={() => setFiltersOpen((value) => !value)}>
            筛选{activeCount ? ` · ${activeCount}` : ""}<i aria-hidden="true">{filtersOpen ? "−" : "+"}</i>
          </button>
        </div>
        <div className={`post-filters-controls post-filters-drawer ${filtersOpen ? "is-open" : ""}`} id="editorial-filter-controls" hidden={!filtersOpen}>{controls}</div>
        {activeFilters.length ? <div className="post-filters-active" aria-label="已启用的筛选条件">
          <span>正在查看</span>
          {activeFilters.map((item) => <button key={item.key} type="button" onClick={() => onChange(item.key, item.resetValue || "")} aria-label={`移除筛选：${item.label}`}>{item.label}<i aria-hidden="true">×</i></button>)}
        </div> : null}
      </section>
    );
  }

  return (
    <section className={`post-filters post-filters-editorial post-filters-${isNote ? "note" : "article"}`} aria-label="内容筛选" aria-busy={loading || undefined}>
      <header className="post-filters-heading">
        <span>INDEX FILTERS</span>
        <strong>筛选目录</strong>
        <small>{activeCount ? `${activeCount} 项条件已启用` : "快速缩小阅读范围"}</small>
        <button className="post-filters-toggle" type="button" aria-expanded={filtersOpen} aria-controls="editorial-filter-controls" onClick={() => setFiltersOpen((value) => !value)}>
          {filtersOpen ? "收起" : "展开"}<i aria-hidden="true">{filtersOpen ? "−" : "+"}</i>
        </button>
      </header>
      <div className={`post-filters-controls ${filtersOpen ? "is-open" : ""}`} id="editorial-filter-controls">{controls}</div>
      {activeFilters.length ? <div className="post-filters-active" aria-label="已启用的筛选条件">
        <span>正在查看</span>
        {activeFilters.map((item) => <button key={item.key} type="button" onClick={() => onChange(item.key, item.resetValue || "")} aria-label={`移除筛选：${item.label}`}>{item.label}<i aria-hidden="true">×</i></button>)}
      </div> : null}
    </section>
  );
}
