import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useModalDialog } from "../hooks/useModalDialog";
import { useNarrowScreen } from "../hooks/useNarrowScreen";
import "../styles/mobile-sheet.css";

export function MobileSheet({ open, onClose, title, children, closeLabel = "完成", className = "" }) {
  const panelRef = useRef(null);
  const drag = useRef(null);
  const titleId = useId();
  const backdropProps = useModalDialog({ open, panelRef, onClose,
    initialFocus: () => panelRef.current?.querySelector(".mobile-sheet-close") });
  const settle = (dismiss = false) => {
    drag.current = null;
    const panel = panelRef.current;
    if (!panel) return;
    const from = panel.style.transform;
    panel.style.transform = "";
    if (dismiss) onClose();
    else if (from && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      panel.animate([{ transform: from }, { transform: "translateY(0)" }], { duration: 160, easing: "ease-out" });
    }
  };
  if (!open) return null;
  return createPortal(<div className="mobile-sheet-backdrop" {...backdropProps}>
    <section ref={panelRef} className={`mobile-sheet ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <div className="mobile-sheet-grip" aria-hidden="true"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          drag.current = { id: event.pointerId, y: event.clientY, distance: 0 };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (drag.current?.id !== event.pointerId) return;
          drag.current.distance = Math.max(0, event.clientY - drag.current.y);
          if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) panelRef.current.style.transform = `translateY(${drag.current.distance}px)`;
        }}
        onPointerUp={() => settle((drag.current?.distance || 0) > 80)}
        onPointerCancel={() => settle()}
        onLostPointerCapture={() => { if (drag.current) settle(); }}><span /></div>
      <header className="mobile-sheet-heading"><h2 id={titleId}>{title}</h2><button className="text-button mobile-sheet-close" type="button" onClick={onClose}>{closeLabel}</button></header>
      <div className="mobile-sheet-body">{children}</div>
    </section>
  </div>, document.body);
}

// Desktop keeps the existing controls; only the narrow layout changes its surface.
export function MobileActions({ children, title = "帖子操作", label = "更多操作", className = "" }) {
  const narrow = useNarrowScreen();
  const [open, setOpen] = useState(false);
  if (!narrow) return children;
  return <div className={className}>
    <button className="text-button mobile-sheet-trigger" type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>{label}</button>
    <MobileSheet open={open} onClose={() => setOpen(false)} title={title}>
      <div className="mobile-sheet-actions" onClick={(event) => {
        if (event.target.closest("a[href], button:not(:disabled)")) setOpen(false);
      }}>{children}</div>
    </MobileSheet>
  </div>;
}
