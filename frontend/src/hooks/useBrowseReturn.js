import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { browsePositions, rememberSessionValue } from "../lib/mobileSession";

// Save positions, not API responses: returning always rechecks current read access.
export function useBrowseReturn(ready, contentSelector = null) {
  const { user } = useAuth();
  const location = useLocation();
  const navigation = useNavigationType();
  const key = `${user?.id}:${location.key}:${location.pathname}${location.search}`;
  // 页内切换（例如合集的年份、筛选）用 navigate state 标记 keepScroll，不把页面拉回顶部。
  const keepScroll = Boolean(location.state?.keepScroll);
  const pending = useRef(null);
  const restored = useRef(false);
  const readyRef = useRef(ready);
  readyRef.current = ready;

  useLayoutEffect(() => {
    pending.current = navigation === "POP" ? browsePositions.get(key) : null;
    restored.current = false;
    if (!pending.current && !location.hash && !keepScroll) window.scrollTo({ top: 0, behavior: "instant" });
    let position = pending.current || { y: 0 };
    const remember = () => {
      if (!readyRef.current || (pending.current && !restored.current)) return;
      position = { y: window.scrollY };
      rememberSessionValue(browsePositions, key, position);
    };
    const captureLink = (event) => {
      const link = event.target.closest?.("main a[href]");
      if (!link || !readyRef.current) return;
      const href = link.getAttribute("href");
      const occurrence = [...document.querySelectorAll("main a[href]")].filter((item) => item.getAttribute("href") === href).indexOf(link);
      position = { y: window.scrollY, href, occurrence, top: link.getBoundingClientRect().top };
      rememberSessionValue(browsePositions, key, position);
    };
    window.addEventListener("scroll", remember, { passive: true });
    document.addEventListener("click", captureLink, true);
    return () => {
      window.removeEventListener("scroll", remember);
      document.removeEventListener("click", captureLink, true);
    };
  }, [key, navigation, location.hash, keepScroll]);

  useEffect(() => {
    if (!ready || restored.current || !pending.current || location.hash) return undefined;
    const saved = pending.current;
    let frame;
    let timer;
    let started = false;
    let stopped = false;
    const restore = () => {
      if (stopped) return;
      const link = saved.href && [...document.querySelectorAll("main a[href]")].filter((item) => item.getAttribute("href") === saved.href)[saved.occurrence || 0];
      const y = link ? window.scrollY + link.getBoundingClientRect().top - saved.top : saved.y;
      window.scrollTo({ top: Math.max(0, y), behavior: "instant" });
    };
    const stop = () => {
      stopped = true;
      restored.current = true;
      observer.disconnect();
      waiting.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
    const observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(restore); });
    const start = () => {
      if (started || stopped || (contentSelector && !document.querySelector(contentSelector))) return;
      started = true;
      waiting.disconnect();
      observer.observe(document.querySelector("main") || document.body);
      restore();
      timer = window.setTimeout(stop, 1800);
    };
    // A collection's metadata can finish well before its timeline or media list.
    const waiting = new MutationObserver(start);
    waiting.observe(document.getElementById("root"), { childList: true, subtree: true });
    start();
    // Never fight a person's scroll while images or nested lists finish loading.
    window.addEventListener("pointerdown", stop, { passive: true, once: true });
    window.addEventListener("wheel", stop, { passive: true, once: true });
    window.addEventListener("keydown", stop, { once: true });
    return () => {
      stop();
      window.removeEventListener("pointerdown", stop);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("keydown", stop);
    };
  }, [key, ready, location.hash, contentSelector]);
}
