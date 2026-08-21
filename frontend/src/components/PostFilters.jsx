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

export function PostFilters({ type = "", filters, options = {}, loading = false, onChange, onClear, showSort = true }) {
  const isNote = type === "note";
  return (
    <section className="post-filters" aria-label="内容筛选" aria-busy={loading || undefined}>
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
      <button className="text-button post-filters-clear" type="button" onClick={onClear}>清除筛选</button>
    </section>
  );
}
