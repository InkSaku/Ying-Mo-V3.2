import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CollectionShelfBook } from "./CollectionCard";
import { useModalDialog } from "../hooks/useModalDialog";
import { startCollectionOpening } from "../lib/collectionOpening";
import { formatDate } from "../lib/format";
import { PAPER_EASE, paperMotionAllowed } from "../lib/paperMotion";

const PULL_MS = 460;
const RETURN_MS = 320;
const NAMED_MEMBERS = 4;

function monthLabel(value) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "" : `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function recordLine(collection) {
  if (!collection.post_count) return "还没有记录";
  const first = monthLabel(collection.first_record_at);
  const last = monthLabel(collection.last_record_at);
  const span = first && last ? (first === last ? ` · ${first}` : ` · ${first} — ${last}`) : "";
  return `${collection.post_count} 则${span}`;
}

function memberLine(collection) {
  const names = (collection.members || []).map((member) => member.nickname || member.username).filter(Boolean);
  if (!names.length) return "只有创建者";
  const shown = names.slice(0, NAMED_MEMBERS).join("、");
  return names.length > NAMED_MEMBERS ? `${shown} 等 ${names.length} 位` : shown;
}

// 书架上那本书的书身。介绍打开期间它被抽走，书架留出空位。
const shelfStage = (id) => document.querySelector(`.collection-bookshelf-track [data-flip-key="${id}"] .collection-shelf-stage`);

function towards(from, to) {
  return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
}

/**
 * 合集介绍卡：从书架上抽出一册，左边是书，右边是简介、成员、记录跨度和更新时间。
 * “进入合集”沿用书册翻开动效，左右键或上一册／下一册在当前书架里翻看。
 */
export function CollectionIntro({ collections, index, volumeOffset = 0, onIndex, onClose }) {
  const collection = collections[index];
  const panel = useRef(null);
  const card = useRef(null);
  const pulled = useRef(false);
  const [direction, setDirection] = useState("");
  const [closing, setClosing] = useState(false);
  const path = `/collections/${collection.slug}`;
  const catalogueNumber = String(volumeOffset + index + 1).padStart(2, "0");

  const step = (delta) => {
    const next = index + delta;
    if (next < 0 || next >= collections.length) return;
    setDirection(delta > 0 ? "is-next" : "is-prev");
    onIndex(next);
  };

  const requestClose = () => {
    if (closing) return;
    const target = card.current?.querySelector(".collection-shelf-stage");
    const source = shelfStage(collection.id);
    const to = source?.getBoundingClientRect();
    if (!paperMotionAllowed() || !target || !to?.width || to.bottom < 0 || to.top > window.innerHeight) {
      onClose();
      return;
    }
    // 放回：书沿原路落回书架上的空位，再把空位还给原来的书。
    setClosing(true);
    const from = target.getBoundingClientRect();
    target.style.transformOrigin = "0 0";
    target.animate([{ transform: "none" }, { transform: towards(to, from) }], { duration: RETURN_MS, easing: "cubic-bezier(.4, 0, .2, 1)", fill: "forwards" })
      .finished.then(onClose, onClose);
  };

  useModalDialog({
    open: true,
    panelRef: panel,
    onClose: requestClose,
    initialFocus: () => card.current?.querySelector(".collection-intro-enter"),
    onKeyDown: (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.target.closest?.("input, textarea, select")) return;
      event.preventDefault();
      step(event.key === "ArrowRight" ? 1 : -1);
    },
  });

  // 抽出：第一次打开时书从书架飞到介绍卡里；之后左右翻看只换书，不再飞。
  useLayoutEffect(() => {
    const source = shelfStage(collection.id);
    if (source) source.style.visibility = "hidden";
    const target = card.current?.querySelector(".collection-shelf-stage");
    if (!pulled.current && source && target && paperMotionAllowed()) {
      const from = source.getBoundingClientRect();
      const to = target.getBoundingClientRect();
      if (from.width && to.width && from.bottom > 0 && from.top < window.innerHeight) {
        target.style.transformOrigin = "0 0";
        target.animate([{ transform: towards(from, to) }, { transform: "none" }], { duration: PULL_MS, easing: PAPER_EASE });
      }
    }
    pulled.current = true;
    return () => {
      if (source) source.style.visibility = "";
    };
  }, [collection.id]);

  return <div className={`collection-intro-layer${closing ? " is-closing" : ""}`}>
    <div className="collection-intro-backdrop" aria-hidden="true" onClick={requestClose} />
    <section ref={panel} className="collection-intro" role="dialog" aria-modal="true" aria-labelledby="collection-intro-title" tabIndex={-1}>
      <header className="collection-intro-bar">
        <span className="tabular">VOL. {catalogueNumber}</span>
        <span className="tabular" aria-live="polite">{index + 1} / {collections.length}</span>
        <button type="button" className="collection-intro-close" onClick={requestClose} aria-label="放回书架">
          <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m5 5 10 10M15 5 5 15" /></svg>
        </button>
      </header>
      <article key={collection.id} ref={card} className={`collection-card collection-card-shelf collection-intro-card ${direction}`}>
        <div className="collection-intro-book"><CollectionShelfBook collection={collection} catalogueNumber={catalogueNumber} /></div>
        <div className="collection-card-content collection-intro-copy">
          <h3 id="collection-intro-title">{collection.name}</h3>
          {collection.description ? <p>{collection.description}</p> : <span className="collection-intro-empty">还没有写简介。</span>}
          {/* 翻开动效的扉页署名从这里取字，界面上由下面的条目代替。 */}
          <div className="collection-book-meta" aria-hidden="true">
            <span>{collection.creator?.nickname || "未知创建者"}</span>
            <span aria-hidden="true">·</span>
            <span>{collection.member_count ? `${collection.member_count} 位合集成员` : "合集成员"}</span>
          </div>
          <dl className="collection-intro-facts">
            <div><dt>创建</dt><dd>{collection.creator?.nickname || "未知创建者"}</dd></div>
            <div><dt>成员</dt><dd>{memberLine(collection)}</dd></div>
            <div><dt>记录</dt><dd className="tabular">{recordLine(collection)}</dd></div>
            <div><dt>更新</dt><dd className="tabular">{formatDate(collection.updated_at)}</dd></div>
          </dl>
          <Link className="btn btn-primary collection-intro-enter" to={path} onClick={(event) => startCollectionOpening(event, collection.slug, card.current)}>
            进入合集
            <svg viewBox="0 0 24 16" aria-hidden="true" focusable="false"><path d="M2 8h19m-6-5 6 5-6 5" /></svg>
          </Link>
        </div>
      </article>
      <footer className="collection-intro-nav">
        <button type="button" className="text-button" disabled={index === 0} onClick={() => step(-1)}>← 上一册</button>
        <button type="button" className="text-button" disabled={index === collections.length - 1} onClick={() => step(1)}>下一册 →</button>
      </footer>
    </section>
  </div>;
}
