import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigationType } from "react-router-dom";
import { ConfirmDialog } from "./ConfirmDialog";
import { MobileActions } from "./MobileSheet";
import { PostCard } from "./PostCard";
import { CollectionFileIcon } from "./CollectionFileIcon";
import { CollectionFolderDrawer } from "./CollectionFolderDrawer";
import { EmptyState } from "./States";
import { UndoNotice } from "./UndoNotice";
import { api } from "../lib/api";
import {
  MAX_FOLDER_DEPTH,
  childFolders,
  collectionFolderHref,
  flattenFolders,
  folderPath,
  folderSummary,
  movingLabel,
  postsInFolder,
  subtreeHeight,
  subtreeIds,
} from "../lib/collectionFolders";

const NO_IDS = [];
// 超过这个层数，抽屉会把下面的记录推得太远，其余目录回到普通目录行。
const DRAWER_LIMIT = 8;
const classNames = (...names) => names.filter(Boolean).join(" ");

function ChevronGlyph() {
  return <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>;
}

function FolderNameForm({ label, initial = "", busy, onSubmit, onCancel }) {
  const [name, setName] = useState(initial);
  return <form className="collection-folder-name-form" onSubmit={(event) => { event.preventDefault(); onSubmit(name); }} onKeyDown={(event) => { if (event.key === "Escape") onCancel(); }}>
    <input aria-label={label} placeholder="目录名称" value={name} maxLength={80} autoFocus disabled={busy} onChange={(event) => setName(event.target.value)} />
    <button className="btn btn-primary" type="submit" disabled={busy || !name.trim()}>保存</button>
    <button className="text-button" type="button" disabled={busy} onClick={onCancel}>取消</button>
  </form>;
}

function MoveDialog({ moving, collection, index, busy, onTarget, onConfirm, onClose }) {
  const isFolder = moving?.kind === "folder";
  const blocked = isFolder ? subtreeIds(index, moving.item.id) : new Set();
  const height = isFolder ? subtreeHeight(index, moving.item.id) : 0;
  const current = isFolder ? moving.item.parent_id ?? null : moving?.from ?? null;
  const option = (value, label, depth, disabled) => (
    <label key={value ?? "root"} className={moving?.target === value ? "is-selected" : ""} style={{ "--folder-depth": depth }}>
      <input type="radio" name="collection-folder-target" checked={moving?.target === value} disabled={disabled || busy} onChange={() => onTarget(value)} />
      <CollectionFileIcon kind={value === null ? "collection" : "folder"} open={moving?.target === value} /><span>{label}</span>{current === value ? <small>当前位置</small> : null}
    </label>
  );
  return <ConfirmDialog open={Boolean(moving)} wide busy={busy} title={moving ? `把${movingLabel(moving)}移动到` : ""} confirmLabel="移动到这里" confirmDisabled={!moving || moving.target === current} onConfirm={onConfirm} onClose={onClose}>
    <div className="collection-folder-picker" role="radiogroup" aria-label="选择目录">
      {option(null, `${collection.name}（合集根目录）`, 0, false)}
      {flattenFolders(index).map(({ folder, depth }) => option(folder.id, folder.name, depth, blocked.has(folder.id) || depth + height > MAX_FOLDER_DEPTH))}
    </div>
  </ConfirmDialog>;
}

export function CollectionFolderContents({ collection, index, folderId, user, moves }) {
  const navigationType = useNavigationType();
  const sectionRef = useRef(null);
  const previousFolder = useRef(folderId);
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [moving, setMoving] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [selection, setSelection] = useState({ folderId, ids: NO_IDS, anchor: null });
  // 只有换过目录才播放抽屉升起，打开合集时直接显示。
  const [seenFolder, setSeenFolder] = useState(folderId);
  const [changedFolder, setChangedFolder] = useState(false);
  if (seenFolder !== folderId) {
    setSeenFolder(folderId);
    setChangedFolder(true);
  }
  // 触屏上拖拽会和滚动抢手势，继续用“选择”和“移动到…”。
  const [finePointer] = useState(() => window.matchMedia("(hover: hover) and (pointer: fine)").matches);
  const { busy, error, notice, run, clearFeedback } = moves;

  // 封面很高：进入下一层时把目录顶部带回视口，而不是回到页面最上方。
  useLayoutEffect(() => {
    if (previousFolder.current === folderId) return;
    previousFolder.current = folderId;
    const section = sectionRef.current;
    if (navigationType === "POP" || !section) return;
    if (section.getBoundingClientRect().top < Number.parseFloat(getComputedStyle(section).scrollMarginTop || "0")) {
      section.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }, [folderId, navigationType]);

  const base = `/collections/${collection.id}`;
  const path = folderPath(index, folderId);
  const current = path.at(-1) || null;
  const folders = childFolders(index, folderId);
  const posts = postsInFolder(collection.posts, index, folderId);
  const isCreator = collection.creator.id === user.id;
  const writeHref = (type) => `/write?type=${type}&collection=${collection.id}${folderId ? `&folder=${folderId}` : ""}`;
  const atDepthLimit = path.length >= MAX_FOLDER_DEPTH;
  const deletingSummary = deleting ? {
    folders: childFolders(index, deleting.id).length,
    records: postsInFolder(collection.posts, index, deleting.id).length,
  } : null;

  const canMovePost = (post) => post.author?.id === user.id || isCreator;
  const movablePosts = posts.filter(canMovePost);
  const selectedIds = selection.folderId === folderId ? selection.ids : NO_IDS;
  const selectedPosts = movablePosts.filter((post) => selectedIds.includes(post.id));
  const hasSelection = selectedPosts.length > 0;
  const clearSelection = () => setSelection({ folderId, ids: NO_IDS, anchor: null });

  useEffect(() => {
    if (!hasSelection || moving || deleting) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setSelection({ folderId, ids: NO_IDS, anchor: null });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleting, folderId, hasSelection, moving]);

  const toggleSelected = (post, extendRange) => setSelection((value) => {
    const ids = new Set(value.folderId === folderId ? value.ids : NO_IDS);
    const anchor = value.folderId === folderId ? value.anchor : null;
    const order = movablePosts.map((item) => item.id);
    if (extendRange && order.includes(anchor)) {
      const [start, end] = [order.indexOf(anchor), order.indexOf(post.id)].sort((a, b) => a - b);
      order.slice(start, end + 1).forEach((id) => ids.add(id));
    } else if (ids.has(post.id)) {
      ids.delete(post.id);
    } else {
      ids.add(post.id);
    }
    return { folderId, ids: [...ids], anchor: post.id };
  });

  const postMove = (items) => ({ kind: "post", from: folderId ?? null, items });

  const renamingFolder = folders.find((folder) => folder.id === renamingId);
  const folderActions = (folder) => <>
    <button className="text-button" type="button" disabled={busy} onClick={() => { setRenamingId(folder.id); clearFeedback(); }}>改名</button>
    <button className="text-button" type="button" disabled={busy} onClick={() => setMoving({ kind: "folder", item: folder, target: folder.parent_id ?? null })}>移动</button>
    <button className="text-button danger-text" type="button" disabled={busy} onClick={() => setDeleting(folder)}>删除</button>
  </>;

  const cardProps = (post) => {
    const movable = canMovePost(post);
    const isSelected = selectedIds.includes(post.id);
    const isDragged = moves.dragging?.kind === "post" && moves.dragging.items.some((item) => item.id === post.id);
    return {
      className: classNames(isSelected && movable && "is-selected", isDragged && "is-drag-source"),
      ...(finePointer && movable ? {
        draggable: !busy,
        onDragStart: (event) => moves.startDrag(event, postMove(isSelected ? selectedPosts : [post])),
        onDragEnd: moves.endDrag,
      } : {}),
      // 已经在选内容时，点卡片继续选择，不打开详情。
      onClickCapture: hasSelection && movable ? (event) => {
        if (event.target.closest(".collection-entry-tools")) return;
        event.preventDefault();
        event.stopPropagation();
        toggleSelected(post, event.shiftKey);
      } : undefined,
    };
  };

  const createFolder = async (name) => {
    if (await run(() => api.post(`${base}/folders`, { name, parent_id: folderId ?? null }), "目录已创建。")) setCreating(false);
  };
  const renameFolder = async (folder, name) => {
    if (await run(() => api.patch(`${base}/folders/${folder.id}`, { name }), "目录已改名。")) setRenamingId(null);
  };
  const confirmMove = async () => {
    if (await moves.move(moving, moving.target)) setMoving(null);
  };
  const confirmDelete = async () => {
    await run(() => api.delete(`${base}/folders/${deleting.id}`), "目录已删除，里面的内容已移到上一级。");
    setDeleting(null);
  };

  return <section ref={sectionRef} className="collection-overview-section collection-posts-section collection-folder-view" aria-labelledby="collection-posts-title">
    {path.length ? <nav className="collection-folder-breadcrumb" aria-label="当前位置">
      <Link className={moves.dropClass(null)} to={collectionFolderHref(collection.slug)} state={{ keepScroll: true }} {...moves.dropProps(null)}><CollectionFileIcon kind="collection" />{collection.name}</Link>
      {path.map((item, position) => <span key={item.id}><i aria-hidden="true">/</i>{position === path.length - 1 ? <b aria-current="page">{item.name}</b> : <Link className={moves.dropClass(item.id)} to={collectionFolderHref(collection.slug, item.id)} state={{ keepScroll: true }} {...moves.dropProps(item.id)}>{item.name}</Link>}</span>)}
    </nav> : null}
    <header className="collection-spread-heading collection-folder-heading">
      <div><h2 id="collection-posts-title">{current?.name || "合集内容"}</h2><p>{folders.length ? `${folders.length} 个目录 · ` : ""}{posts.length} 则记录</p></div>
      <div className="collection-folder-actions" role="group" aria-label="在这里新建">
        <button className="btn btn-secondary" type="button" disabled={busy || atDepthLimit} title={atDepthLimit ? `目录最多 ${MAX_FOLDER_DEPTH} 层` : undefined} onClick={() => { setCreating(true); clearFeedback(); }}>新建目录</button>
        <Link className="btn btn-secondary" to={writeHref("article")}>写文章</Link>
        <Link className="btn btn-secondary" to={writeHref("note")}>写随记</Link>
      </div>
    </header>
    {atDepthLimit ? <p className="collection-folder-hint">已经是第 {MAX_FOLDER_DEPTH} 层，这里不能再建子目录。</p> : null}
    {finePointer && index.byId.size && movablePosts.length ? <p className="collection-folder-hint">把内容拖到目录上就能移动，勾选“选择”可以一次移动多条。</p> : null}
    {error ? <div className="inline-error" role="alert">{error}</div> : null}
    {notice ? <div className="inline-success" role="status">{notice}</div> : null}

    {creating || renamingFolder ? <div className="collection-folder-list collection-folder-editing">
      {creating ? <div className="collection-folder-row is-editing"><span className="collection-folder-glyph"><CollectionFileIcon open /></span><FolderNameForm label="新目录名称" busy={busy} onSubmit={createFolder} onCancel={() => setCreating(false)} /></div> : null}
      {renamingFolder ? <div key={renamingFolder.id} className="collection-folder-row is-editing"><span className="collection-folder-glyph"><CollectionFileIcon open /></span><FolderNameForm label={`修改「${renamingFolder.name}」的名称`} initial={renamingFolder.name} busy={busy} onSubmit={(name) => renameFolder(renamingFolder, name)} onCancel={() => setRenamingId(null)} /></div> : null}
    </div> : null}

    {folders.length ? <CollectionFolderDrawer key={folderId ?? "root"} collection={collection} index={index} folders={folders.slice(0, DRAWER_LIMIT)} label={current?.name || "合集内容"} total={folders.length} finePointer={finePointer} animate={changedFolder} moves={moves} renderActions={folderActions} /> : null}

    {folders.length > DRAWER_LIMIT ? <div className="collection-folder-list">
      {folders.slice(DRAWER_LIMIT).map((folder) => <article key={folder.id}
        className={classNames("collection-folder-row", moves.dropClass(folder.id), moves.dragging?.kind === "folder" && moves.dragging.item.id === folder.id && "is-drag-source")}
        {...moves.dropProps(folder.id)}
        {...(finePointer && folder.can_manage ? { draggable: !busy, onDragStart: (event) => moves.startDrag(event, { kind: "folder", item: folder }), onDragEnd: moves.endDrag } : {})}>
        <span className="collection-folder-glyph"><CollectionFileIcon open={Boolean(moves.dropClass(folder.id))} /></span>
        <Link className="collection-folder-link" to={collectionFolderHref(collection.slug, folder.id)} state={{ keepScroll: true }}><strong>{folder.name}</strong><small>{folderSummary(index, collection.posts, folder)}</small></Link>
        {folder.can_manage ? <div className="collection-folder-row-actions">
          <MobileActions title={`管理「${folder.name}」`} label="管理">{folderActions(folder)}</MobileActions>
        </div> : null}
      </article>)}
    </div> : null}

    {hasSelection ? <div className="collection-selection-bar" role="group" aria-label="已选内容的操作">
      <strong role="status">已选 {selectedPosts.length} 则</strong>
      {selectedPosts.length < movablePosts.length ? <button className="text-button" type="button" disabled={busy} onClick={() => setSelection({ folderId, ids: movablePosts.map((post) => post.id), anchor: null })}>全选</button> : null}
      <button className="text-button" type="button" disabled={busy} onClick={clearSelection}>取消选择</button>
      <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => setMoving({ ...postMove(selectedPosts), target: folderId ?? null })}>移动到…</button>
    </div> : null}

    {posts.length
      ? <div className={classNames("collection-post-catalogue", hasSelection && "has-selection")}>{posts.map((post, position) => <PostCard key={post.id} post={post} compact variant="collection" index={position} hideCollection cardProps={cardProps(post)}
        footer={canMovePost(post) ? <div className="collection-entry-tools">
          <button className="text-button collection-entry-move" type="button" disabled={busy} onClick={() => setMoving({ ...postMove([post]), target: folderId ?? null })}>移动</button>
          <label className="collection-entry-select"><input type="checkbox" aria-label={`选择「${post.title || "这则随记"}」`} checked={selectedIds.includes(post.id)} disabled={busy} onChange={(event) => toggleSelected(post, event.nativeEvent.shiftKey)} />选择</label>
        </div> : null} />)}</div>
      : !folders.length && !creating
        ? <EmptyState title={current ? "这个目录还是空的" : "这个合集还没有已发布内容"} description={current ? "可以在这里新建目录，或写一篇文章、一则随记。" : "创建者与成员都可以在这里发表自己的记录。"} />
        : null}

    <MoveDialog moving={moving} collection={collection} index={index} busy={busy} onTarget={(target) => setMoving((value) => ({ ...value, target }))} onConfirm={confirmMove} onClose={() => { if (!busy) setMoving(null); }} />
    <ConfirmDialog open={Boolean(deleting)} danger busy={busy} title={deleting ? `删除目录「${deleting.name}」？` : ""}
      description={deletingSummary && (deletingSummary.folders || deletingSummary.records)
        ? `里面的 ${[deletingSummary.folders ? `${deletingSummary.folders} 个子目录` : "", deletingSummary.records ? `${deletingSummary.records} 则记录` : ""].filter(Boolean).join("和 ")}会移到上一级，不会被删除。`
        : "这个目录是空的，删除后不影响任何内容。"}
      confirmLabel="删除目录" onConfirm={confirmDelete} onClose={() => { if (!busy) setDeleting(null); }} />
    <UndoNotice message={moves.moved?.message} busy={busy} error={moves.undoError} onUndo={moves.undoMove} onClose={moves.dismissMoved} label="移动操作反馈" closeLabel="关闭移动反馈" />
  </section>;
}

export function CollectionFolderTree({ slug, index, folderId, moves }) {
  const [toggled, setToggled] = useState({});
  const trail = useMemo(() => new Set(folderPath(index, folderId).map((folder) => folder.id)), [index, folderId]);
  if (!index.byId.size) return null;
  const level = (parentId) => <ul>
    {childFolders(index, parentId).map((folder) => {
      const hasChildren = childFolders(index, folder.id).length > 0;
      const expanded = toggled[folder.id] ?? trail.has(folder.id);
      return <li key={folder.id}>
        <div className={classNames("collection-tree-row", moves.dropClass(folder.id))} {...moves.dropProps(folder.id, hasChildren && !expanded ? () => setToggled((value) => ({ ...value, [folder.id]: true })) : undefined)}>
          {hasChildren
            ? <button type="button" className={expanded ? "is-expanded" : ""} aria-expanded={expanded} aria-label={`${expanded ? "收起" : "展开"}${folder.name}`} onClick={() => setToggled((value) => ({ ...value, [folder.id]: !expanded }))}><ChevronGlyph /></button>
            : <span aria-hidden="true" />}
          <Link to={collectionFolderHref(slug, folder.id)} state={{ keepScroll: true }} title={folder.name} aria-current={folder.id === folderId ? "page" : undefined}><CollectionFileIcon open={expanded || folder.id === folderId || Boolean(moves.dropClass(folder.id))} /><span>{folder.name}</span></Link>
        </div>
        {hasChildren && expanded ? level(folder.id) : null}
      </li>;
    })}
  </ul>;
  return <section className="collection-index-section collection-folder-tree" aria-labelledby="collection-tree-title">
    <header><h2 id="collection-tree-title">目录</h2></header>
    <div className={classNames("collection-tree-row is-root", moves.dropClass(null))} {...moves.dropProps(null)}><span aria-hidden="true" /><Link to={collectionFolderHref(slug)} state={{ keepScroll: true }} aria-current={folderId ? undefined : "page"}><CollectionFileIcon kind="collection" /><span>全部内容</span></Link></div>
    {level(null)}
  </section>;
}
