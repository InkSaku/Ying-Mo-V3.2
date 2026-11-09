import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CollectionFileIcon } from "./CollectionFileIcon";
import { MobileActions } from "./MobileSheet";
import { excerpt, formatDate, postTypeLabel } from "../lib/format";
import {
  childFolders,
  collectionFolderHref,
  folderSummary,
  latestPostInSubtree,
  recordTime,
} from "../lib/collectionFolders";

// 索引签在各层错开：数值是签左侧线段占剩余宽度的比例。
const TAB_OFFSETS = [0.6, 0.1, 0.72, 0.28, 0.52, 0.14];
const EXIT_MS = 200;
const classNames = (...names) => names.filter(Boolean).join(" ");

function TabSlope({ side }) {
  return <svg className={`collection-drawer-slope is-${side}`} viewBox="0 0 12 28" width="12" height="28" aria-hidden="true" focusable="false">
    <path className="slope-fill" d="M0 28 9.8.7 12 0v28Z" />
    <path className="slope-line" d="m.1 27.5 9-26.8L12 0v2.1l-1.2.2-8.7 25.6Z" />
  </svg>;
}

// 抽屉的墨面留在结构边缘，纸色仍与页面相通；拉手与标签共同表达档案柜前脸。
function DrawerFrontInk() {
  return <svg className="collection-drawer-front-ink" viewBox="0 0 1000 84" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="m1.7 2 174-1.1 309 .7L758 .4 998 2l1.2 34.6-.8 45.7-218.5 1-328.4-.8L2.2 84 .5 51.8Z" />
    <path className="drawer-paper" d="m4.2 4.3 171.6-.9 309 .5 273.4-.8 236.7 1.5.5 31.9-.6 43-215.3.4-328.2-.4-446.8.8-.4-28.6Z" />
    <path className="drawer-paper" d="m35 .9 126 .1-7.4.8-116.2.4Zm807 80.5 108-.2-5.8.8-100.9.4Z" />
    <path fill="currentColor" d="m5.2 77.1 67.3.2-8.3.8-58.9-.2Zm927.4-70.7 60.5.3.1.9-53.8-.4Z" />
  </svg>;
}

function DrawerPull() {
  return <svg className="collection-drawer-pull" viewBox="0 0 96 28" width="96" height="28" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="m1.6 4.6 13.1-.7 1.2 18.7-13.6.7ZM80.7 4l13.7.5-.7 18.8-13.5-.4Z" />
    <path fill="currentColor" d="m9 8.4 77.1-.9 3.5 3.3-.6 12-3.4 2.8-74.7-.5-3.8-3.6.1-10.9Z" />
    <path className="drawer-paper" d="m12.3 12.3 71.7-1 .6 9.8-72.8-.7Z" />
    <path className="drawer-paper" d="m4.9 8.2 2.6-.2.2 2.7-2.7.1Zm82.4-.4 2.7.1-.1 2.6-2.6-.1ZM17 23.6l18.8.2-1.7.8-16.8-.1Z" />
  </svg>;
}

function DrawerCard({ post }) {
  const source = post.post_type === "article" && post.title ? `${postTypeLabel(post.post_type)}《${post.title}》` : postTypeLabel(post.post_type);
  return <div className="collection-drawer-card" aria-hidden="true">
    <div className="collection-drawer-card-heading"><span>最新摘录</span><time dateTime={recordTime(post)}>{formatDate(recordTime(post))}</time></div>
    <p>{excerpt(post) || post.title || "这则记录只有影像。"}</p>
    <small className="collection-drawer-card-source">{post.author?.nickname ? `${post.author.nickname} · ` : ""}{source}</small>
  </div>;
}

// 同层目录叠成一只抽屉：DOM 顺序仍是目录顺序，越靠后的层越靠近读者。
export function CollectionFolderDrawer({ collection, index, folders, label, total, finePointer, animate, moves, renderActions }) {
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState(null);
  const [leavingId, setLeavingId] = useState(null);
  const exitTimer = useRef(0);
  const focusedId = useRef(null);
  const { busy } = moves;

  useEffect(() => () => window.clearTimeout(exitTimer.current), []);

  const latestByFolder = useMemo(() => new Map(
    folders.map((folder) => [folder.id, latestPostInSubtree(collection.posts, index, folder.id)]),
  ), [collection.posts, folders, index]);
  const hasCards = finePointer && [...latestByFolder.values()].some(Boolean);

  const enter = (event, folder, href) => {
    if (leavingId !== null) {
      event.preventDefault();
      return;
    }
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    event.preventDefault();
    setLeavingId(folder.id);
    exitTimer.current = window.setTimeout(() => navigate(href, { state: { keepScroll: true } }), EXIT_MS);
  };

  const active = folders.find((folder) => folder.id === activeId);
  const frontName = active?.name || label;
  const frontSummary = active ? folderSummary(index, collection.posts, active) : `${total} 个目录`;

  return <div
    className={classNames("collection-folder-drawer", hasCards && "has-cards", animate && "is-entering", leavingId !== null && "is-leaving")}
    style={{ "--drawer-count": folders.length }}
    onMouseLeave={() => setActiveId(focusedId.current)}
    onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) {
        focusedId.current = null;
        setActiveId(null);
      }
    }}
  >
    {folders.map((folder, position) => {
      const href = collectionFolderHref(collection.slug, folder.id);
      const summary = folderSummary(index, collection.posts, folder);
      const latest = latestByFolder.get(folder.id);
      const depth = folders.length - position;
      const offset = TAB_OFFSETS[position % TAB_OFFSETS.length];
      const isDropTarget = Boolean(moves.dropClass(folder.id));
      return <article
        key={folder.id}
        className={classNames(
          "collection-drawer-item",
          depth > 3 && "is-far",
          childFolders(index, folder.id).length > 0 && "has-children",
          (activeId === folder.id || isDropTarget) && "is-active",
          leavingId === folder.id && "is-keep",
          moves.dropClass(folder.id),
          moves.dragging?.kind === "folder" && moves.dragging.item.id === folder.id && "is-drag-source",
        )}
        style={{
          "--drawer-index": position,
          "--drawer-depth": depth,
          "--drawer-tab-before": offset,
          "--drawer-tab-after": 1 - offset,
          "--drawer-stagger": position % 3,
        }}
        onMouseEnter={() => setActiveId(folder.id)}
        onFocus={() => { focusedId.current = folder.id; setActiveId(folder.id); }}
        {...moves.dropProps(folder.id)}
        {...(finePointer && folder.can_manage ? { draggable: !busy, onDragStart: (event) => moves.startDrag(event, { kind: "folder", item: folder }), onDragEnd: moves.endDrag } : {})}
      >
        <CollectionFileIcon open={isDropTarget} />
        {finePointer && latest ? <DrawerCard post={latest} /> : null}
        <div className="collection-drawer-face">
          <Link className="collection-drawer-link" to={href} state={{ keepScroll: true }} title={folder.name} aria-label={`${folder.name}，${summary}`} onClick={(event) => enter(event, folder, href)}>
            <span className="collection-drawer-tabline">
              <i className="is-before" aria-hidden="true" />
              <TabSlope side="left" />
              <strong><span className="collection-drawer-tab-number" aria-hidden="true">{String(position + 1).padStart(2, "0")}</span><span className="collection-drawer-tab-name">{folder.name}</span></strong>
              <TabSlope side="right" />
              <i className="is-after" aria-hidden="true" />
            </span>
            <span className="collection-drawer-sheet" aria-hidden="true" />
          </Link>
          <div className="collection-drawer-meta">
            {folder.can_manage ? <div className="collection-drawer-actions">
              <MobileActions title={`管理「${folder.name}」`} label="管理">{renderActions(folder)}</MobileActions>
            </div> : null}
            <small aria-hidden="true">{summary}</small>
          </div>
        </div>
      </article>;
    })}
    <div className="collection-drawer-front" aria-hidden="true">
      <DrawerFrontInk />
      <CollectionFileIcon kind={active ? "folder" : "collection"} open={Boolean(active)} />
      <span className="collection-drawer-front-label"><strong>{frontName}</strong><small>{frontSummary}</small></span>
      <DrawerPull />
    </div>
  </div>;
}
