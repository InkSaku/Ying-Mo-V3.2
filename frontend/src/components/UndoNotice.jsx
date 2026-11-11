import { createPortal } from "react-dom";

export function UndoNotice({ message, busy, error, onUndo, onClose, label = "收藏操作反馈", closeLabel = "关闭收藏反馈" }) {
  if (!message) return null;
  return createPortal(<aside className="undo-notice" aria-label={label}>
    <div><p role="status">{message}</p>{error ? <p className="inline-error" role="alert">{error}</p> : null}</div>
    {onUndo ? <button className="text-button" type="button" disabled={busy} onClick={onUndo}>{busy ? "处理中…" : "撤销"}</button> : null}
    <button className="text-button undo-notice-close" type="button" disabled={busy} aria-label={closeLabel} onClick={onClose}>关闭</button>
  </aside>, document.body);
}
