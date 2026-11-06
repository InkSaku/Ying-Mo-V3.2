import { createPortal } from "react-dom";

export function UndoNotice({ message, busy, error, onUndo, onClose }) {
  if (!message) return null;
  return createPortal(<aside className="undo-notice" aria-label="收藏操作反馈">
    <div><p role="status">{message}</p>{error ? <p className="inline-error" role="alert">{error}</p> : null}</div>
    <button className="text-button" type="button" disabled={busy} onClick={onUndo}>{busy ? "处理中…" : "撤销"}</button>
    <button className="text-button undo-notice-close" type="button" disabled={busy} aria-label="关闭收藏反馈" onClick={onClose}>关闭</button>
  </aside>, document.body);
}
