import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigationType } from "react-router-dom";
import { ConfirmDialog } from "./ConfirmDialog";
import { MobileActions } from "./MobileSheet";
import { PostCard } from "./PostCard";
import { EmptyState } from "./States";
import { api } from "../lib/api";
import {
  MAX_FOLDER_DEPTH,
  childFolders,
  collectionFolderHref,
  flattenFolders,
  folderPath,
  postsInFolder,
  subtreeHeight,
  subtreeIds,
} from "../lib/collectionFolders";

function FolderGlyph() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 7.5a2 2 0 0 1 2-2h3.6l2 2.5h7.4a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" /></svg>;
}

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

function folderSummary(index, posts, folder) {
  const folders = childFolders(index, folder.id).length;
  const records = postsInFolder(posts, index, folder.id).length;
  if (!folders && !records) return "空目录";
  return [folders ? `${folders} 个目录` : "", records ? `${records} 则记录` : ""].filter(Boolean).join(" · ");
}

function MoveDialog({ moving, collection, index, busy, onTarget, onConfirm, onClose }) {
  const isFolder = moving?.kind === "folder";
  const blocked = isFolder ? subtreeIds(index, moving.item.id) : new Set();
  const height = isFolder ? subtreeHeight(index, moving.item.id) : 0;
  const current = isFolder ? moving.item.parent_id ?? null : moving?.item.collection_folder_id ?? null;
  const itemName = isFolder ? moving.item.name : moving?.item.title || "这则随记";
  const option = (value, label, depth, disabled) => (
    <label key={value ?? "root"} className={moving?.target === value ? "is-selected" : ""} style={{ "--folder-depth": depth }}>
      <input type="radio" name="collection-folder-target" checked={moving?.target === value} disabled={disabled || busy} onChange={() => onTarget(value)} />
      <FolderGlyph /><span>{label}</span>{current === value ? <small>当前位置</small> : null}
    </label>
  );
  return <ConfirmDialog open={Boolean(moving)} wide busy={busy} title={`把「${itemName}」移动到`} confirmLabel="移动到这里" confirmDisabled={!moving || moving.target === current} onConfirm={onConfirm} onClose={onClose}>
    <div className="collection-folder-picker" role="radiogroup" aria-label="选择目录">
      {option(null, `${collection.name}（合集根目录）`, 0, false)}
      {flattenFolders(index).map(({ folder, depth }) => option(folder.id, folder.name, depth, blocked.has(folder.id) || depth + height > MAX_FOLDER_DEPTH))}
    </div>
  </ConfirmDialog>;
}

export function CollectionFolderContents({ collection, index, folderId, user, onChanged }) {
  const navigationType = useNavigationType();
  const sectionRef = useRef(null);
  const previousFolder = useRef(folderId);
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [moving, setMoving] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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

  const run = async (action, success) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      await onChanged();
      setNotice(success);
      return true;
    } catch (failure) {
      setError(failure.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const createFolder = async (name) => {
    if (await run(() => api.post(`${base}/folders`, { name, parent_id: folderId ?? null }), "目录已创建。")) setCreating(false);
  };
  const renameFolder = async (folder, name) => {
    if (await run(() => api.patch(`${base}/folders/${folder.id}`, { name }), "目录已改名。")) setRenamingId(null);
  };
  const confirmMove = async () => {
    const request = moving.kind === "folder"
      ? () => api.patch(`${base}/folders/${moving.item.id}`, { parent_id: moving.target })
      : () => api.put(`${base}/posts/${moving.item.id}/folder`, { folder_id: moving.target });
    if (await run(request, "已移动。")) setMoving(null);
  };
  const confirmDelete = async () => {
    await run(() => api.delete(`${base}/folders/${deleting.id}`), "目录已删除，里面的内容已移到上一级。");
    setDeleting(null);
  };

  return <section ref={sectionRef} className="collection-overview-section collection-posts-section collection-folder-view" aria-labelledby="collection-posts-title">
    {path.length ? <nav className="collection-folder-breadcrumb" aria-label="当前位置">
      <Link to={collectionFolderHref(collection.slug)} state={{ keepScroll: true }}>{collection.name}</Link>
      {path.map((item, position) => <span key={item.id}><i aria-hidden="true">/</i>{position === path.length - 1 ? <b aria-current="page">{item.name}</b> : <Link to={collectionFolderHref(collection.slug, item.id)} state={{ keepScroll: true }}>{item.name}</Link>}</span>)}
    </nav> : null}
    <header className="collection-spread-heading collection-folder-heading">
      <div><h2 id="collection-posts-title">{current?.name || "合集内容"}</h2><p>{folders.length ? `${folders.length} 个目录 · ` : ""}{posts.length} 则记录</p></div>
      <div className="collection-folder-actions" role="group" aria-label="在这里新建">
        <button className="btn btn-secondary" type="button" disabled={busy || atDepthLimit} title={atDepthLimit ? `目录最多 ${MAX_FOLDER_DEPTH} 层` : undefined} onClick={() => { setCreating(true); setError(""); setNotice(""); }}>新建目录</button>
        <Link className="btn btn-secondary" to={writeHref("article")}>写文章</Link>
        <Link className="btn btn-secondary" to={writeHref("note")}>写随记</Link>
      </div>
    </header>
    {atDepthLimit ? <p className="collection-folder-hint">已经是第 {MAX_FOLDER_DEPTH} 层，这里不能再建子目录。</p> : null}
    {error ? <div className="inline-error" role="alert">{error}</div> : null}
    {notice ? <div className="inline-success" role="status">{notice}</div> : null}

    {creating || folders.length ? <div className="collection-folder-list">
      {creating ? <div className="collection-folder-row is-editing"><span className="collection-folder-glyph"><FolderGlyph /></span><FolderNameForm label="新目录名称" busy={busy} onSubmit={createFolder} onCancel={() => setCreating(false)} /></div> : null}
      {folders.map((folder) => renamingId === folder.id
        ? <div key={folder.id} className="collection-folder-row is-editing"><span className="collection-folder-glyph"><FolderGlyph /></span><FolderNameForm label={`修改「${folder.name}」的名称`} initial={folder.name} busy={busy} onSubmit={(name) => renameFolder(folder, name)} onCancel={() => setRenamingId(null)} /></div>
        : <article key={folder.id} className="collection-folder-row">
          <span className="collection-folder-glyph"><FolderGlyph /></span>
          <Link className="collection-folder-link" to={collectionFolderHref(collection.slug, folder.id)} state={{ keepScroll: true }}><strong>{folder.name}</strong><small>{folderSummary(index, collection.posts, folder)}</small></Link>
          {folder.can_manage ? <div className="collection-folder-row-actions">
            <MobileActions title={`管理「${folder.name}」`} label="管理">
              <button className="text-button" type="button" disabled={busy} onClick={() => { setRenamingId(folder.id); setError(""); setNotice(""); }}>改名</button>
              <button className="text-button" type="button" disabled={busy} onClick={() => setMoving({ kind: "folder", item: folder, target: folder.parent_id ?? null })}>移动</button>
              <button className="text-button danger-text" type="button" disabled={busy} onClick={() => setDeleting(folder)}>删除</button>
            </MobileActions>
          </div> : null}
        </article>)}
    </div> : null}

    {posts.length
      ? <div className="collection-post-catalogue">{posts.map((post, position) => <PostCard key={post.id} post={post} compact variant="collection" index={position} hideCollection
        footer={post.author?.id === user.id || isCreator ? <button className="text-button collection-entry-move" type="button" disabled={busy} onClick={() => setMoving({ kind: "post", item: post, target: post.collection_folder_id ?? null })}>移动</button> : null} />)}</div>
      : !folders.length && !creating
        ? <EmptyState title={current ? "这个目录还是空的" : "这个合集还没有已发布内容"} description={current ? "可以在这里新建目录，或写一篇文章、一则随记。" : "创建者与成员都可以在这里发表自己的记录。"} />
        : null}

    <MoveDialog moving={moving} collection={collection} index={index} busy={busy} onTarget={(target) => setMoving((value) => ({ ...value, target }))} onConfirm={confirmMove} onClose={() => { if (!busy) setMoving(null); }} />
    <ConfirmDialog open={Boolean(deleting)} danger busy={busy} title={deleting ? `删除目录「${deleting.name}」？` : ""}
      description={deletingSummary && (deletingSummary.folders || deletingSummary.records)
        ? `里面的 ${[deletingSummary.folders ? `${deletingSummary.folders} 个子目录` : "", deletingSummary.records ? `${deletingSummary.records} 则记录` : ""].filter(Boolean).join("和 ")}会移到上一级，不会被删除。`
        : "这个目录是空的，删除后不影响任何内容。"}
      confirmLabel="删除目录" onConfirm={confirmDelete} onClose={() => { if (!busy) setDeleting(null); }} />
  </section>;
}

export function CollectionFolderTree({ slug, index, folderId }) {
  const [toggled, setToggled] = useState({});
  const trail = useMemo(() => new Set(folderPath(index, folderId).map((folder) => folder.id)), [index, folderId]);
  if (!index.byId.size) return null;
  const level = (parentId) => <ul>
    {childFolders(index, parentId).map((folder) => {
      const hasChildren = childFolders(index, folder.id).length > 0;
      const expanded = toggled[folder.id] ?? trail.has(folder.id);
      return <li key={folder.id}>
        <div className="collection-tree-row">
          {hasChildren
            ? <button type="button" className={expanded ? "is-expanded" : ""} aria-expanded={expanded} aria-label={`${expanded ? "收起" : "展开"}${folder.name}`} onClick={() => setToggled((value) => ({ ...value, [folder.id]: !expanded }))}><ChevronGlyph /></button>
            : <span aria-hidden="true" />}
          <Link to={collectionFolderHref(slug, folder.id)} state={{ keepScroll: true }} title={folder.name} aria-current={folder.id === folderId ? "page" : undefined}>{folder.name}</Link>
        </div>
        {hasChildren && expanded ? level(folder.id) : null}
      </li>;
    })}
  </ul>;
  return <section className="collection-index-section collection-folder-tree" aria-labelledby="collection-tree-title">
    <header><h2 id="collection-tree-title">目录</h2></header>
    <div className="collection-tree-row is-root"><span aria-hidden="true" /><Link to={collectionFolderHref(slug)} state={{ keepScroll: true }} aria-current={folderId ? undefined : "page"}>全部内容</Link></div>
    {level(null)}
  </section>;
}
