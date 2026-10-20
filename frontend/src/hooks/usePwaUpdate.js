import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

const CHECK_INTERVAL = 60_000;
const RESUME_THROTTLE = 15_000;

export function usePwaUpdate() {
  const [registration, setRegistration] = useState(null);
  const [update, setUpdate] = useState({ worker: null, phase: "idle" });
  const { updateServiceWorker } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_url, nextRegistration) {
      if (nextRegistration) setRegistration(nextRegistration);
    },
  });

  useEffect(() => {
    if (!registration) return undefined;
    const listeners = new Map();
    let lastCheck = 0;
    let checking = false;
    let disposed = false;

    const observe = (worker) => {
      // The first offline installation is not a product update.
      if (!worker || (!registration.active && !navigator.serviceWorker.controller)) return;
      const sync = () => {
        if (disposed) return;
        const phase = worker.state === "installed" ? "ready"
          : worker.state === "installing" ? "preparing"
            : worker.state === "redundant" ? "failed" : null;
        if (!phase) return;
        setUpdate((current) => {
          if (phase === "failed" && current.worker !== worker) return current;
          if (current.worker === worker && current.phase === phase) return current;
          return { worker, phase };
        });
      };
      if (!listeners.has(worker)) {
        listeners.set(worker, sync);
        worker.addEventListener("statechange", sync);
      }
      sync();
    };
    const inspect = () => observe(registration.installing || registration.waiting);
    const check = async (force = false) => {
      if (document.visibilityState !== "visible" || !navigator.onLine || checking || registration.installing) return;
      if (!force && Date.now() - lastCheck < RESUME_THROTTLE) return;
      checking = true;
      lastCheck = Date.now();
      try {
        await registration.update();
        if (!disposed) inspect();
      } catch {
        // An offline/check failure must not interrupt reading or editing.
      } finally {
        checking = false;
      }
    };
    const resume = () => { void check(); };
    const reconnect = () => { void check(true); };
    registration.addEventListener("updatefound", inspect);
    window.addEventListener("focus", resume);
    window.addEventListener("online", reconnect);
    document.addEventListener("visibilitychange", resume);
    const interval = window.setInterval(resume, CHECK_INTERVAL);
    inspect();
    void check(true);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      registration.removeEventListener("updatefound", inspect);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", reconnect);
      document.removeEventListener("visibilitychange", resume);
      for (const [worker, listener] of listeners) worker.removeEventListener("statechange", listener);
    };
  }, [registration]);

  const refresh = async () => {
    if (registration?.waiting) await updateServiceWorker(true);
    else window.location.reload();
  };

  const retry = async () => {
    if (!registration) throw new Error("Update registration unavailable");
    await registration.update();
  };

  return { ...update, refresh, retry };
}
