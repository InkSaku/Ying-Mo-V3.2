import { useEffect, useRef } from "react";
import { dialogControls, lockPageScroll } from "../lib/dialog";

const dialogs = [];

export function useModalDialog({ open, panelRef, onClose, busy = false, blocked = false, initialFocus, onKeyDown, restoreFocus = true }) {
  const options = useRef(null);
  const backdropPress = useRef(false);
  options.current = { onClose, busy, blocked, initialFocus, onKeyDown, restoreFocus };

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    const token = { previousFocus, panel: panelRef.current };
    dialogs.push(token);
    const unlock = lockPageScroll();
    const frame = requestAnimationFrame(() => {
      if (dialogs.at(-1) !== token || options.current.blocked || document.querySelector("dialog[open]")) return;
      const panel = panelRef.current;
      (options.current.initialFocus?.() || dialogControls(panel)[0] || panel)?.focus({ preventScroll: true });
    });

    const handleKey = (event) => {
      if (event.defaultPrevented || dialogs.at(-1) !== token || options.current.blocked
        || document.querySelector("dialog[open]")) return;
      options.current.onKeyDown?.(event);
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!options.current.busy) options.current.onClose?.();
      } else if (event.key === "Tab") {
        const panel = panelRef.current;
        const controls = dialogControls(panel);
        const first = controls[0];
        const last = controls.at(-1);
        if (!first) { event.preventDefault(); panel?.focus({ preventScroll: true }); }
        else if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement))) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement))) {
          event.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKey);
      const wasTop = dialogs.at(-1) === token;
      const index = dialogs.indexOf(token);
      const child = dialogs[index + 1];
      // A confirmation can close its parent at the same time; keep the original entry.
      if (child && (!child.previousFocus?.isConnected || token.panel?.contains(child.previousFocus))) {
        child.previousFocus = token.previousFocus;
      }
      dialogs.splice(index, 1);
      unlock();
      if (wasTop && options.current.restoreFocus && token.previousFocus instanceof HTMLElement && token.previousFocus.isConnected) {
        token.previousFocus.focus({ preventScroll: true });
      }
    };
  }, [open, panelRef]);

  return {
    onPointerDown: (event) => { backdropPress.current = event.target === event.currentTarget; },
    onClick: (event) => {
      if (backdropPress.current && event.target === event.currentTarget && !options.current.busy) options.current.onClose?.();
      backdropPress.current = false;
    },
  };
}
