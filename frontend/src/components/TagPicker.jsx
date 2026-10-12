import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { normalizeTagName, selectedTagNames, tagKey } from "../lib/tagSelection";

export function TagPicker({ value, onChange, disabled = false, initialTags = [] }) {
  const helpId = useId();
  const [query, setQuery] = useState("");
  const [retry, setRetry] = useState(0);
  const [known, setKnown] = useState(() => Object.fromEntries(initialTags.map((tag) => [tagKey(tag.name), tag])));
  const [result, setResult] = useState({ query: "", items: [], loading: true, error: "" });
  const names = selectedTagNames(value);
  const normalized = normalizeTagName(query);

  useEffect(() => {
    const controller = new AbortController();
    setResult({ query: normalized, items: [], loading: true, error: "" });
    const timer = window.setTimeout(async () => {
      try {
        const response = await api.get(`/tags/options/search?q=${encodeURIComponent(normalized)}&limit=${normalized ? 20 : 10}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        const items = response.data || [];
        setKnown((current) => ({ ...current, ...Object.fromEntries(items.map((tag) => [tagKey(tag.name), tag])) }));
        setResult({ query: normalized, items, loading: false, error: "" });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ query: normalized, items: [], loading: false, error: error.message });
      }
    }, normalized ? 200 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [normalized, retry]);

  // Existing selected tags outside the top ten need their own visible counts.
  const missing = names.filter((name) => known[tagKey(name)]?.visible_post_count === undefined).join("\n");
  useEffect(() => {
    if (!missing) return undefined;
    const controller = new AbortController();
    Promise.all(missing.split("\n").map(async (name) => {
      try {
        const result = await api.get(`/tags/options/search?q=${encodeURIComponent(name)}&limit=1`, { signal: controller.signal });
        return result.data?.find((tag) => tagKey(tag.name) === tagKey(name)) || { name, visible_post_count: 0 };
      } catch { return null; }
    })).then((items) => {
      if (!controller.signal.aborted) setKnown((current) => ({ ...current, ...Object.fromEntries(items.filter(Boolean).map((tag) => [tagKey(tag.name), tag])) }));
    });
    return () => controller.abort();
  }, [missing]);

  const items = result.query === normalized ? result.items : [];
  const loading = result.loading || result.query !== normalized;
  const exact = items.find((tag) => tagKey(tag.name) === tagKey(normalized));
  const selected = (name) => names.some((item) => tagKey(item) === tagKey(name));
  const add = (name) => {
    if (disabled || selected(name) || names.length >= 20) return;
    onChange([...names, normalizeTagName(name)]);
    setQuery("");
  };
  const toggle = (name) => selected(name)
    ? onChange(names.filter((item) => tagKey(item) !== tagKey(name))) : add(name);

  return <div className="tag-picker">
    <label className="tag-picker-search">
      <span aria-hidden="true">#</span>
      <input aria-label="搜索或新建标签" aria-describedby={helpId} value={query} maxLength={80} disabled={disabled} placeholder="搜索或输入新标签名称" onChange={(event) => setQuery(event.target.value)} />
    </label>
    <div className="tag-picker-hint" id={helpId} aria-live="polite">
      <span>{loading ? "正在寻找这个词…" : result.error ? "标签暂时无法读取" : exact?.is_active === false ? "这个标签已停用，请选择其他主题。" : exact ? `已有标签 · ${exact.visible_post_count} 篇引用` : normalized ? `找到 ${items.length} 个相关标签` : "常用主题 · 引用最多的前 10 个"}</span>
      {result.error ? <button type="button" disabled={disabled} onClick={() => setRetry((value) => value + 1)}>重试</button> : normalized && !loading ? <button type="button" disabled={disabled || names.length >= 20 || exact?.is_active === false || (exact && selected(exact.name))} onClick={() => add(exact?.name || normalized)}>{exact ? selected(exact.name) ? "已选中 ✓" : "选择已有标签" : `＋ 创建「${normalized}」`}</button> : null}
    </div>
    <div className="tag-picker-options" aria-label="可用标签">
      {items.map((tag) => <div key={tag.id} className={`tag-picker-option ${selected(tag.name) ? "is-selected" : ""}`}>
        <button type="button" aria-pressed={selected(tag.name)} disabled={disabled || (!selected(tag.name) && (names.length >= 20 || tag.is_active === false))} onClick={() => toggle(tag.name)}><span>{selected(tag.name) ? "✓" : "#"} {tag.name}</span><small>{tag.visible_post_count} 篇{tag.is_active === false ? " · 已停用" : ""}</small></button>
        {tag.visible_post_count > 0 && tag.is_active !== false ? <Link to={`/tags/${tag.slug}`} target="_blank" rel="noopener noreferrer" aria-label={`查看${tag.name}标签分区`}>↗</Link> : <span className="tag-picker-no-partition" title={tag.is_active === false ? "这个标签已停用" : "发布后可查看标签分区"}>↗</span>}
      </div>)}
    </div>
    {!loading && !result.error && !items.length && !normalized ? <p className="tag-picker-empty">还没有可用主题，写下第一个词吧。</p> : null}
    <div className="tag-picker-chosen"><span>已选 {names.length} / 20 个标签</span><div>
      {names.map((name) => {
        const tag = known[tagKey(name)];
        return <span className="tag-picker-selected" key={tagKey(name)}>
          {tag?.slug && tag.visible_post_count > 0 && tag.is_active !== false ? <Link to={`/tags/${tag.slug}`} target="_blank" rel="noopener noreferrer">#{tag.name} · {tag.visible_post_count} 篇 ↗</Link> : <span>#{name} · {tag?.visible_post_count === undefined ? "…" : `${tag.visible_post_count} 篇`}{tag?.is_active === false ? " · 已停用" : ""}</span>}
          <button type="button" disabled={disabled} aria-label={`移除标签${name}`} onClick={() => toggle(name)}>×</button>
        </span>;
      })}
    </div></div>
  </div>;
}
