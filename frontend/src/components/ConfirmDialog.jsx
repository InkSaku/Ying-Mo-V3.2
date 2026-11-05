import { useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useModalDialog } from "../hooks/useModalDialog";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  danger = false,
  wide = false,
  busy = false,
  confirmDisabled = false,
  children,
  onConfirm,
  onClose,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef(null);
  const backdropProps = useModalDialog({ open, panelRef, onClose, busy,
    initialFocus: () => panelRef.current?.querySelector("[data-autofocus]") });

  if (!open) return null;

  return createPortal(
    <div
      className="dialog-backdrop"
      {...backdropProps}
    >
      <section
        className={`dialog-panel${wide ? " dialog-panel-wide" : ""}`}
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <div>
          <p className="hero-kicker">请确认</p>
          <h2 id={titleId}>{title}</h2>
          {description ? <p id={descriptionId}>{description}</p> : null}
          {children ? <div className="dialog-content">{children}</div> : null}
        </div>
        <div className="dialog-actions">
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={onClose} data-autofocus>
            {cancelLabel}
          </button>
          <button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} type="button" disabled={busy || confirmDisabled} onClick={onConfirm}>
            {busy ? "正在处理" : confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
