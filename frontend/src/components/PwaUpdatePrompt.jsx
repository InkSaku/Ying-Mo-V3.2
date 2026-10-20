import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePwaUpdate } from "../hooks/usePwaUpdate";
import updatePage from "../assets/ink/update-page.svg?raw";
import "../styles/pwa-update.css";

export function PwaUpdatePrompt() {
  const { worker, phase, refresh, retry } = usePwaUpdate();
  const [dismissed, setDismissed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef(null);
  const titleRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  const open = phase !== "idle" && worker !== dismissed;
  const preparing = phase === "preparing";
  const failed = phase === "failed";

  useEffect(() => {
    if (!open) return undefined;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    // Do not turn a keystroke in the editor into an accidental refresh.
    titleRef.current?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!busy) return undefined;
    const timer = window.setTimeout(() => {
      setBusy(false);
      setError("暂时没能完成更新，请再试一次。");
    }, 12_000);
    return () => window.clearTimeout(timer);
  }, [busy]);

  const dismiss = () => {
    if (busy) return;
    setDismissed(worker);
    setError("");
  };

  const keepFocusInside = (event) => {
    if (event.key !== "Tab") return;
    const controls = [...dialogRef.current.querySelectorAll("button:not(:disabled)")];
    event.preventDefault();
    if (!controls.length) { titleRef.current?.focus(); return; }
    const current = controls.indexOf(document.activeElement);
    const next = current < 0 ? (event.shiftKey ? controls.length - 1 : 0)
      : (current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
    controls[next].focus();
  };

  const update = async () => {
    if (busy || preparing) return;
    setError("");
    setBusy(true);
    try {
      if (failed) {
        await retry();
        setBusy(false);
      } else {
        await refresh();
      }
    } catch {
      setBusy(false);
      setError("暂时没能完成更新，请检查网络后重试。");
    }
  };

  if (!open) return null;
  return createPortal(
    <dialog
      className="pwa-update-dialog"
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onKeyDown={keepFocusInside}
      onCancel={(event) => { event.preventDefault(); dismiss(); }}
    >
      <button className="pwa-update-close" type="button" aria-label="稍后更新" disabled={busy} onClick={dismiss}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m7 7 10 10M17 7 7 17" /></svg>
      </button>
      <div className="pwa-update-art" aria-hidden="true" dangerouslySetInnerHTML={{ __html: updatePage }} />
      <h2 id={titleId} ref={titleRef} tabIndex={-1}>映墨有更新了。</h2>
      <p id={descriptionId} className="pwa-update-description" role="status" aria-live="polite" aria-atomic="true">
        {preparing ? "新版本正在准备，稍等片刻就好。"
          : failed ? "这次更新还没准备好，可以联网后再试。"
            : "新版本已准备好，刷新就能翻到新的一页。"}
      </p>
      <div className="pwa-update-actions">
        <button className="pwa-update-later" type="button" disabled={busy} onClick={dismiss}>稍后再说</button>
        <button className="pwa-update-refresh" type="button" disabled={busy || preparing} onClick={() => { void update(); }}>
          {busy ? "正在更新…" : preparing ? "正在准备…" : failed ? "重新检查" : "刷新更新"}
          {!busy && !preparing ? <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M19 10a7 7 0 1 0 .2 4M19 5v5h-5" /></svg> : null}
        </button>
      </div>
      <p className="pwa-update-save-note">正在编辑的话，可以先保存，再更新。</p>
      {error ? <p className="pwa-update-error" role="alert">{error}</p> : null}
    </dialog>, document.body,
  );
}
