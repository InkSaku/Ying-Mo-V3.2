import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api";
import { internalLinkPath } from "../lib/contentLinks";
import { continuationLabel } from "../lib/continuations";
import { excerpt, formatDate, postTypeLabel } from "../lib/format";
import "../styles/link-preview.css";

const PREVIEWABLE_PATH = /^\/(?:articles\/[a-z0-9]+(?:-[a-z0-9]+)*|notes\/\d+)$/;
const SHOW_DELAY = 320;
const HIDE_DELAY = 120;
const CARD_WIDTH = 320;
const CARD_HEIGHT = 190;
const GUTTER = 16;
const cache = new Map();

function previewPath(link) {
  if (!link.closest("[data-link-preview-scope]") || link.closest(".continuation-source")) return null;
  const path = internalLinkPath(link.getAttribute("href"));
  const pathname = path?.split(/[?#]/)[0].replace(/\/$/, "");
  if (!pathname || !PREVIEWABLE_PATH.test(pathname)) return null;
  // 同一篇里的标题锚点不用预览自己。
  return pathname === window.location.pathname.replace(/\/$/, "") ? null : pathname;
}

function loadPreview(path) {
  if (!cache.has(path)) {
    cache.set(path, api.get(`/posts/link-preview?path=${encodeURIComponent(path)}`)
      .then((result) => result.data)
      .catch((error) => {
        // 读不到的就记住不再请求；网络失败下次再试。
        if (error.status !== 404) cache.delete(path);
        return null;
      }));
  }
  return cache.get(path);
}

function cardPosition(link) {
  const rect = link.getBoundingClientRect();
  const width = Math.min(CARD_WIDTH, window.innerWidth - GUTTER * 2);
  const left = Math.min(Math.max(GUTTER, rect.left), window.innerWidth - width - GUTTER);
  return rect.bottom + 8 + CARD_HEIGHT < window.innerHeight
    ? { left, width, top: rect.bottom + 8 }
    : { left, width, bottom: window.innerHeight - rect.top + 8 };
}

// 阅读页里的站内文章、随记链接：精细指针悬停或键盘聚焦时浮出摘要，触屏不出现。
export function InternalLinkPreview() {
  const tooltipId = useId();
  const [card, setCard] = useState(null);

  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return undefined;
    let active = null;
    let showTimer = 0;
    let hideTimer = 0;
    const hide = () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
      if (active?.getAttribute("aria-describedby") === tooltipId) active.removeAttribute("aria-describedby");
      active = null;
      setCard(null);
    };
    const open = (link) => {
      const path = previewPath(link);
      if (!path) return;
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
      if (active && active !== link) hide();
      active = link;
      showTimer = window.setTimeout(async () => {
        const data = await loadPreview(path);
        if (active !== link || !data || !link.isConnected) return;
        link.setAttribute("aria-describedby", tooltipId);
        setCard({ data, style: cardPosition(link) });
      }, SHOW_DELAY);
    };
    const linkFrom = (event) => event.target instanceof Element ? event.target.closest("a[href]") : null;
    const onOver = (event) => {
      const link = linkFrom(event);
      if (!link) return;
      if (link === active) window.clearTimeout(hideTimer);
      else open(link);
    };
    const onOut = (event) => {
      const link = linkFrom(event);
      if (!link || link !== active || link.contains(event.relatedTarget)) return;
      window.clearTimeout(showTimer);
      hideTimer = window.setTimeout(hide, HIDE_DELAY);
    };
    const onFocusIn = (event) => {
      const link = linkFrom(event);
      if (link?.matches(":focus-visible")) open(link);
    };
    const onFocusOut = (event) => { if (event.target === active) hide(); };
    const onKeyDown = (event) => { if (event.key === "Escape") hide(); };
    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", hide, { passive: true });
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", hide);
      window.removeEventListener("resize", hide);
      hide();
    };
  }, [tooltipId]);

  if (!card) return null;
  const { data, style } = card;
  const text = data.title ? excerpt(data) : "";
  return createPortal(<div id={tooltipId} role="tooltip" className="link-preview" style={style}>
    <small>{postTypeLabel(data.post_type)} · {formatDate(data.published_at)}</small>
    <strong>{continuationLabel(data)}</strong>
    {text ? <p>{text}</p> : null}
    {data.author?.nickname ? <small>{data.author.nickname}</small> : null}
  </div>, document.body);
}
