import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { InkSketch } from "./InkSketch";
import { TagPicker } from "./TagPicker";
import "../styles/publish-dialog.css";

export function PublishDialog({ open, form, collections, initialTags, lockedCollection = false, busy, error, unavailable, onChange, onClose, onConfirm }) {
  const titleId = useId();
  const panelRef = useRef(null);
  const callbacks = useRef({ onClose, busy });
  const [collectionQuery, setCollectionQuery] = useState("");
  callbacks.current = { onClose, busy };
  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => panelRef.current?.focus());
    const handleKey = (event) => {
      if (event.key === "Escape" && !callbacks.current.busy) { event.preventDefault(); callbacks.current.onClose(); }
      if (event.key !== "Tab") return;
      const elements = [...panelRef.current.querySelectorAll("button:not(:disabled), input:not(:disabled), a[href], [tabindex='0']")];
      if (!elements.length) { event.preventDefault(); return; }
      const first = elements[0]; const last = elements.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panelRef.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [open]);
  if (!open) return null;
  const collection = collections.find((item) => String(item.id) === form.collection_id);
  const choices = collections.filter((item) => item.name.toLowerCase().includes(collectionQuery.trim().toLowerCase()));
  return createPortal(<div className="publish-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="publish-dialog">
      <header className="publish-dialog-heading"><p></p><button type="button" disabled={busy} aria-label="关闭发布确认" onClick={onClose}>×</button><h2 id={titleId}>确认发布</h2><span>确认阅读范围后发布。</span><div><small>将要发布</small>{form.title.trim() || "一则新的随记"}</div></header>
      <div className="publish-dialog-columns">
        <section className="publish-dialog-pane"><header><div><p></p><h3>{lockedCollection ? "所属合集" : "加入合集（选填）"}</h3><span>{lockedCollection ? "这则共同回忆沿用原合集。" : "选填，可单独发布。"}</span></div><InkSketch variant="place" /></header>
          {collections.length > 4 ? <input className="publish-collection-search" aria-label="搜索可加入的合集" placeholder="搜索合集" disabled={busy || lockedCollection} value={collectionQuery} onChange={(event) => setCollectionQuery(event.target.value)} /> : null}
          <div className="publish-collection-choices" aria-label="选择合集">{choices.map((item) => <button key={item.id} type="button" aria-pressed={String(item.id) === form.collection_id} disabled={busy || lockedCollection} className={`publish-book ${String(item.id) === form.collection_id ? "is-selected" : ""}`} onClick={() => onChange({ collection_id: String(item.id) })}><i aria-hidden="true" /><span><strong>{item.name}</strong><small>{item.description || ""}</small></span><b aria-hidden="true">{String(item.id) === form.collection_id ? "✓" : ""}</b></button>)}</div>
          {!choices.length ? <p className="publish-choice-empty">{collectionQuery ? "没有找到这册合集。" : "当前没有可加入的合集。"}</p> : null}
          <button className={`publish-no-collection ${!form.collection_id ? "is-selected" : ""}`} type="button" aria-pressed={!form.collection_id} disabled={busy || lockedCollection} onClick={() => onChange({ collection_id: "" })}>不加入合集，单独发布 {!form.collection_id ? "✓" : ""}</button>
          {form.collection_id ? <p className="publish-scope">{unavailable ? "原合集当前不可投稿，请重新选择。" : `加入「${collection?.name || "原合集"}」· 仅合集成员可见`}</p> : <fieldset className="publish-visibility" disabled={busy}><legend>谁可以阅读？</legend><label><input type="radio" name="publish-visibility" checked={form.visibility === "private"} onChange={() => onChange({ visibility: "private" })} />仅自己</label><label><input type="radio" name="publish-visibility" checked={form.visibility === "login_only"} onChange={() => onChange({ visibility: "login_only" })} />所有映墨成员</label></fieldset>}
        </section>
        <section className="publish-dialog-pane"><header><div><p></p><h3>标签（选填）</h3><span>选择已有标签，或输入名称新建。</span></div><InkSketch variant="labels" /></header><TagPicker value={form.tag_names} initialTags={initialTags} disabled={busy} onChange={(names) => onChange({ tag_names: names })} /></section>
      </div>
      {error ? <div className="publish-dialog-error" role="alert">{error}</div> : null}
      <footer><p>{lockedCollection ? "这则补充将发布到原合集。" : "合集和标签可不选。"}</p><div><button type="button" className="publish-back" disabled={busy} onClick={onClose}>继续写作</button><button type="button" className="publish-confirm" disabled={busy || unavailable} onClick={onConfirm}>{busy ? "正在发布…" : "确认发布"}<span aria-hidden="true">↗</span></button></div></footer>
    </section>
  </div>, document.body);
}
