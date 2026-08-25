import { useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

export function PwaUpdatePrompt() {
  const [busy, setBusy] = useState(false);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  const update = async () => {
    setBusy(true);
    try {
      await updateServiceWorker(true);
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="notification-toast pwa-update-toast" role="status" aria-live="polite" aria-atomic="true">
      <span>映墨的新版本已准备好。</span>
      <button className="pwa-update-action" type="button" disabled={busy} onClick={() => { void update(); }}>
        {busy ? "更新中" : "刷新更新"}
      </button>
      <button type="button" disabled={busy} aria-label="稍后更新" onClick={() => setNeedRefresh(false)}>×</button>
    </div>
  );
}
