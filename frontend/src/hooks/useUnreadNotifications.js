import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { newNotificationDelta, normalizeUnreadCount } from "../lib/notificationCount";

const POLL_INTERVAL_MS = 60_000;
const TOAST_DURATION_MS = 7_000;

export function useUnreadNotifications(userId) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [toastDelta, setToastDelta] = useState(0);
  const initializedRef = useRef(false);
  const previousRef = useRef(0);
  const inFlightRef = useRef(false);
  const generationRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!userId || inFlightRef.current) return;
    const generation = generationRef.current;
    inFlightRef.current = true;
    try {
      const result = await api.get("/notifications/unread-count");
      if (generation !== generationRef.current) return;
      const next = normalizeUnreadCount(result.data?.unread_count);
      const delta = newNotificationDelta(previousRef.current, next, initializedRef.current);
      previousRef.current = next;
      initializedRef.current = true;
      setUnreadCount(next);
      if (delta) {
        setToastDelta(delta);
        window.dispatchEvent(new CustomEvent("yingmo:new-notifications", {
          detail: { count: delta },
        }));
      }
    } catch {
      // The global indicator is supportive UI. Page requests and auth handling
      // remain authoritative, so a transient count failure stays unobtrusive.
    } finally {
      if (generation === generationRef.current) inFlightRef.current = false;
    }
  }, [userId]);

  useEffect(() => {
    generationRef.current += 1;
    initializedRef.current = false;
    previousRef.current = 0;
    inFlightRef.current = false;
    setUnreadCount(0);
    setToastDelta(0);
    if (!userId) return undefined;

    void refresh();
    const onFocus = () => { void refresh(); };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const interval = window.setInterval(() => { void refresh(); }, POLL_INTERVAL_MS);
    window.addEventListener("focus", onFocus);
    window.addEventListener("yingmo:notifications-changed", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      generationRef.current += 1;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("yingmo:notifications-changed", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh, userId]);

  useEffect(() => {
    if (!toastDelta) return undefined;
    const timer = window.setTimeout(() => setToastDelta(0), TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toastDelta]);

  return {
    unreadCount,
    toastDelta,
    dismissToast: () => setToastDelta(0),
    refresh,
  };
}
