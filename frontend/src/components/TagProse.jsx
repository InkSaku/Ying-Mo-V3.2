import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { excerpt, formatDate, postTypeLabel } from "../lib/format";
import { taxonomyTagProminence } from "../lib/taxonomy";
import { useFlipList } from "../hooks/useFlipList";

// 指针扫过一串词时不必每个都去取，停稳一下再翻。
const HOVER_DELAY = 140;
const WORD_EXIT = [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-6px)" }];
const WORD_ENTER = [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }];

const canHover = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches;

function PreviewBody({ item, preview, path }) {
  const count = item.visible_post_count || 0;
  const head = <header className="taxonomy-tag-preview-head"><strong>#{item.name}</strong><span className="tabular">{count} 则</span></header>;
  if (!preview || preview.status === "loading") return <>{head}<p className="taxonomy-tag-preview-note">正在翻找最近一则…</p></>;
  if (preview.status === "error") return <>{head}<p className="taxonomy-tag-preview-note">暂时取不到最近一则，点开标签再看。</p></>;
  if (preview.status === "empty") return <>{head}<p className="taxonomy-tag-preview-note">这个标签下还没有你能读到的记录。</p></>;
  const { post } = preview;
  const source = post.post_type === "article" && post.title ? `${postTypeLabel(post.post_type)}《${post.title}》` : postTypeLabel(post.post_type);
  return <>
    {head}
    <blockquote>{excerpt(post) || post.title || "这则记录只有影像。"}</blockquote>
    <footer>
      <span>{post.author?.nickname ? `${post.author.nickname} · ` : ""}{source} · <time dateTime={post.published_at}>{formatDate(post.published_at)}</time></span>
      <Link to={`${path}/${item.slug}`}>看全部 {count} 则 →</Link>
    </footer>
  </>;
}

/**
 * 标签连成一段文字：按频次分三档字号，次数像脚注一样上标，词与词之间用顿号，末尾一个句号。
 * 精细指针停在词上时，其余词淡下去，下方翻出这个标签最近的一则；搜索时不匹配的词淡出，其余平滑挪位。
 */
export function TagProse({ items, maxCount, path }) {
  const prose = useRef(null);
  const cache = useRef(new Map());
  const timer = useRef(0);
  const [active, setActive] = useState(null);
  const [preview, setPreview] = useState(null);
  useFlipList(prose, items.map((item) => item.id).join(","), { exit: WORD_EXIT, enter: WORD_ENTER });

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const load = (item) => {
    const cached = cache.current.get(item.slug);
    if (cached) {
      setPreview(cached);
      return;
    }
    setPreview({ slug: item.slug, status: "loading" });
    api.get(`${path}/${encodeURIComponent(item.slug)}?page=1&page_size=1`)
      .then((result) => {
        const post = result.data?.posts?.[0] || null;
        const entry = { slug: item.slug, status: post ? "ready" : "empty", post };
        cache.current.set(item.slug, entry);
        setPreview((current) => (current?.slug === item.slug ? entry : current));
      })
      .catch(() => setPreview((current) => (current?.slug === item.slug ? { slug: item.slug, status: "error" } : current)));
  };

  const point = (item, fromKeyboard = false) => {
    if (!fromKeyboard && !canHover()) return;
    setActive(item);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => load(item), HOVER_DELAY);
  };

  const leave = () => {
    window.clearTimeout(timer.current);
    setActive(null);
  };

  const shown = active && preview?.slug === active.slug ? preview : null;
  return <div className="taxonomy-tag-reading" onMouseLeave={leave} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) leave(); }}>
    <p ref={prose} className={`taxonomy-tag-prose${active ? " has-active" : ""}`}>
      {items.map((item, index) => <span
        key={item.id}
        data-flip-key={item.id}
        className={`taxonomy-tag-item is-${taxonomyTagProminence(item, maxCount)}${index === items.length - 1 ? " is-last" : ""}${active?.id === item.id ? " is-active" : ""}`}
      >
        <Link to={`${path}/${item.slug}`} onMouseEnter={() => point(item)} onFocus={() => point(item, true)} aria-label={`${item.name}，${item.visible_post_count || 0} 则`}>
          {item.name}<sup className="tabular" aria-hidden="true">{item.visible_post_count || 0}</sup>
        </Link>
      </span>)}
    </p>
    <aside className="taxonomy-tag-preview" aria-live="polite">
      {active ? <div key={active.id} className="taxonomy-tag-preview-body"><PreviewBody item={active} preview={shown} path={path} /></div>
        : <p className="taxonomy-tag-preview-note">把指针停在一个词上，看看它最近记下了什么。</p>}
    </aside>
  </div>;
}
