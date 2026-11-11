import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useMediaLightbox } from "../contexts/MediaLightboxContext";
import { useModalDialog } from "../hooks/useModalDialog";
import { continuationLabel } from "../lib/continuations";
import { formatDate, postHref } from "../lib/format";
import { ProtectedImage } from "./ProtectedImage";
import "../styles/collection-stamps.css";

const SWIPE_DISTANCE = 56;
const DISMISS_DISTANCE = 90;
const LEAVE_MS = 220;
const RING_PLACE_LIMIT = 8;
const RING_NAME_LIMIT = 6;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// 横图做成横邮票占两格，竖图和方图占一格；比例收在邮票常见的范围里，避免过长过扁。
function stampShape(image) {
  const ratio = image?.width && image?.height ? image.width / image.height : 0.8;
  return ratio >= 1.2
    ? { wide: true, ratio: Math.min(ratio, 1.6) }
    : { wide: false, ratio: Math.min(Math.max(ratio, 0.75), 1) };
}

// 没有标题的随记用正文开头当名字，和「接着写」里的叫法一致。
function stampTitle(item) {
  return item.post ? continuationLabel(item.post) : "一张图片";
}

function shorten(text, limit) {
  const chars = Array.from(text || "");
  return chars.length > limit ? `${chars.slice(0, limit).join("")}…` : chars.join("");
}

function postmarkDate(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return null;
  return { day: `${date.getMonth() + 1}.${String(date.getDate()).padStart(2, "0")}`, year: String(date.getFullYear()) };
}

// 邮戳只用这则记录已有的信息：地点、记录者和发生日期；靛蓝和映墨的选中线同色。
function Postmark({ item }) {
  const ringId = `stamp-ring-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const date = postmarkDate(item.occurred_at);
  const place = shorten((item.location || "").trim(), RING_PLACE_LIMIT);
  const name = shorten(item.author?.nickname || "成员", RING_NAME_LIMIT);
  const once = `${place ? `${place} · ` : ""}映墨 · ${name} · `;
  // 字太少时绕一圈会被拉得很散，重复一遍让它像真的邮戳那样排满。
  const ring = Array.from(once).length < 14 ? once.repeat(2) : once;
  return <>
    <svg className="stamp-postmark" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <defs><path id={ringId} d="M60 60m-41 0a41 41 0 1 1 82 0a41 41 0 1 1-82 0" /></defs>
      <circle cx="60" cy="60" r="52" />
      <circle className="stamp-postmark-inner" cx="60" cy="60" r="31" />
      <text className="stamp-postmark-ring"><textPath href={`#${ringId}`} textLength="250" lengthAdjust="spacing">{ring}</textPath></text>
      {date ? <><text className="stamp-postmark-day" x="60" y="65">{date.day}</text><text className="stamp-postmark-year" x="60" y="80">{date.year}</text></> : null}
    </svg>
    <svg className="stamp-cancel" viewBox="0 0 100 40" aria-hidden="true" focusable="false">
      <path d="M0 6q8-5 16 0t16 0 16 0 16 0 16 0 16 0M0 16q8-5 16 0t16 0 16 0 16 0 16 0 16 0M0 26q8-5 16 0t16 0 16 0 16 0 16 0 16 0M0 36q8-5 16 0t16 0 16 0 16 0 16 0 16 0" />
    </svg>
  </>;
}

function StampViewer({ items, index, onIndex, onClose, pagination }) {
  const item = index === null ? null : items[index];
  const panelRef = useRef(null);
  const stampRef = useRef(null);
  const gesture = useRef(null);
  const suppressClick = useRef(false);
  const [enter, setEnter] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const titleId = useId();
  const { openGallery } = useMediaLightbox();

  const step = (delta) => {
    const next = index + delta;
    if (next < 0 || next >= items.length) return;
    setEnter(delta);
    onIndex(next);
  };
  // 收起时先让整张纸滑下去，再真正关闭；减少动态效果时直接关。
  const dismiss = () => {
    if (leaving) return;
    if (reducedMotion()) { onClose(); return; }
    setLeaving(true);
    window.setTimeout(() => { setLeaving(false); onClose(); }, LEAVE_MS);
  };
  const backdropProps = useModalDialog({
    open: Boolean(item),
    panelRef,
    onClose: dismiss,
    initialFocus: () => panelRef.current?.querySelector(".stamp-viewer-close"),
    onKeyDown: (event) => {
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        step(event.key === "ArrowRight" ? 1 : -1);
      }
    },
  });
  if (!item) return null;

  const shape = stampShape(item.image);
  const title = stampTitle(item);
  const author = item.author?.nickname || "成员";
  const location = (item.location || "").trim();
  const openOriginal = (event) => {
    if (suppressClick.current) return;
    openGallery({ items, initialMediaId: item.id, context: "collection", pagination, opener: event.currentTarget });
  };

  // 横向拖动换一枚，向下拖动收起；手势只改样式，松手后再决定结果。
  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, axis: null, dx: 0, dy: 0 };
    suppressClick.current = false;
  };
  const onPointerMove = (event) => {
    const current = gesture.current;
    if (current?.id !== event.pointerId) return;
    current.dx = event.clientX - current.x;
    current.dy = event.clientY - current.y;
    if (!current.axis && Math.hypot(current.dx, current.dy) > 8) {
      current.axis = Math.abs(current.dx) > Math.abs(current.dy) ? "x" : "y";
      event.currentTarget.setPointerCapture(event.pointerId);
      suppressClick.current = true;
    }
    if (reducedMotion()) return;
    if (current.axis === "x" && stampRef.current) {
      stampRef.current.style.transition = "none";
      stampRef.current.style.transform = `translateX(${current.dx}px) rotate(${current.dx / 40}deg)`;
    } else if (current.axis === "y" && panelRef.current) {
      panelRef.current.style.transition = "none";
      panelRef.current.style.transform = `translateY(${Math.max(0, current.dy)}px)`;
    }
  };
  const onPointerEnd = (event) => {
    const current = gesture.current;
    if (current?.id !== event.pointerId) return;
    gesture.current = null;
    for (const node of [stampRef.current, panelRef.current]) {
      if (!node) continue;
      node.style.transition = "";
      node.style.transform = "";
    }
    if (current.axis === "x" && Math.abs(current.dx) > SWIPE_DISTANCE) step(current.dx < 0 ? 1 : -1);
    else if (current.axis === "y" && current.dy > DISMISS_DISTANCE) dismiss();
    window.setTimeout(() => { suppressClick.current = false; }, 0);
  };

  return createPortal(<div className={`stamp-viewer-backdrop${leaving ? " is-leaving" : ""}`} {...backdropProps}>
    <section ref={panelRef} className="stamp-viewer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <div className="stamp-viewer-grip" aria-hidden="true" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}><span /></div>
      <header className="stamp-viewer-head">
        <button className="stamp-viewer-close" type="button" aria-label="收起" onClick={dismiss}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </button>
        <span className="stamp-viewer-pill">共同影像</span>
        <span className="stamp-viewer-count">{index + 1} / {items.length}</span>
      </header>
      <div className="stamp-viewer-stage" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
        <button key={item.id} ref={stampRef} type="button" className={`stamp-viewer-stamp${shape.wide ? " is-wide" : ""}`} data-enter={enter} style={{ "--stamp-ratio": shape.ratio }} aria-label={`查看原图：${title}`} onClick={openOriginal}>
          <span className="stamp-paper"><span className="stamp-photo"><ProtectedImage media={item.image} adaptive eager className="stamp-photo-image" alt={`来自${author}的共同影像：${title}`} /></span></span>
          <Postmark item={item} />
        </button>
      </div>
      <div className="stamp-viewer-meta">
        <h2 id={titleId}>{title}</h2>
        <p>{author} · 发生于 <time dateTime={item.occurred_at || undefined}>{formatDate(item.occurred_at)}</time>{location ? ` · ${location}` : ""}{item.kind === "live_photo" ? " · Live Photo" : ""}</p>
        <div className="stamp-viewer-actions">
          <button className="text-button" type="button" onClick={openOriginal}>查看原图</button>
          {item.post ? <Link to={postHref(item.post)} onClick={onClose}>查看原记录 →</Link> : null}
        </div>
      </div>
      <nav className="stamp-viewer-nav" aria-label="切换邮票">
        <button type="button" aria-label="上一枚" disabled={index === 0} onClick={() => step(-1)}>‹</button>
        <span>左右滑动，换一枚</span>
        <button type="button" aria-label="下一枚" disabled={index === items.length - 1} onClick={() => step(1)}>›</button>
      </nav>
    </section>
  </div>, document.body);
}

// 手机上的共同影像：每张照片是一枚齿孔邮票，原图色彩不变；点开盖上记录的邮戳。
export function CollectionStampAlbum({ items, pagination }) {
  const [openIndex, setOpenIndex] = useState(null);
  return <>
    <div className="stamp-album">
      {items.map((item, index) => {
        const shape = stampShape(item.image);
        const kind = item.kind === "live_photo" ? "Live Photo" : "图片";
        return <button key={item.id} type="button" className={`stamp-album-item${shape.wide ? " is-wide" : ""}`} style={{ "--stamp-ratio": shape.ratio }}
          aria-haspopup="dialog" aria-label={`${item.author?.nickname || "成员"}的${kind}：${stampTitle(item)}，${formatDate(item.occurred_at)}`}
          onClick={() => setOpenIndex(index)}>
          <span className="stamp-paper"><span className="stamp-photo"><ProtectedImage media={item.image} adaptive className="stamp-photo-image" alt="" /></span></span>
          {item.kind === "live_photo" ? <span className="stamp-live" aria-hidden="true">LIVE</span> : null}
        </button>;
      })}
    </div>
    <StampViewer items={items} index={openIndex} onIndex={setOpenIndex} onClose={() => setOpenIndex(null)} pagination={pagination} />
  </>;
}
