import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { cancelLoginPageTurn, playLoginPageTurn, prepareLoginPageTurn } from "../lib/loginPageTurn";

function snapshotArticlePage() {
  const source = document.querySelector(".app-frame");
  const snapshot = prepareLoginPageTurn(source);
  if (!snapshot) return null;
  snapshot.paper = getComputedStyle(document.documentElement).getPropertyValue("--page").trim();
  // A scrolled directory's sticky header must keep its on-screen position.
  for (const selector of [".app-header", ".mobile-bottom-nav"]) {
    const original = source.querySelector(selector);
    const copy = snapshot.clone.querySelector(selector);
    if (!original || !copy) continue;
    const rect = original.getBoundingClientRect();
    const style = getComputedStyle(original);
    if (!rect.height || style.display === "none") continue;
    if (style.position === "sticky") {
      const spacer = document.createElement("div");
      spacer.style.height = `${rect.height}px`;
      copy.after(spacer);
    }
    Object.assign(copy.style, {
      position: "fixed", top: `${rect.top}px`, left: `${rect.left}px`,
      width: `${rect.width}px`, height: `${rect.height}px`, margin: "0", bottom: "auto",
    });
  }
  snapshot.clone.querySelectorAll("[style*='view-transition-name']")
    .forEach((element) => { element.style.viewTransitionName = "none"; });
  return snapshot;
}

export function useArticlePageTurn() {
  const location = useLocation();
  const pending = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    const capture = (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || document.hidden) return;
      const link = event.target.closest?.("a[href]");
      if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || !/^\/articles\/[^/]+\/?$/.test(url.pathname)
        || url.pathname === window.location.pathname) return;
      const snapshot = snapshotArticlePage();
      if (!snapshot) return;
      window.clearTimeout(timer.current);
      pending.current = { pathname: url.pathname, snapshot };
      // The link keeps its normal routing, preview state and modifier behavior.
      timer.current = window.setTimeout(() => { pending.current = null; }, 2500);
    };
    document.addEventListener("click", capture, true);
    return () => {
      document.removeEventListener("click", capture, true);
      window.clearTimeout(timer.current);
      pending.current = null;
      cancelLoginPageTurn();
    };
  }, []);

  useLayoutEffect(() => {
    const entry = pending.current;
    if (!entry) return;
    pending.current = null;
    window.clearTimeout(timer.current);
    if (entry.pathname !== location.pathname) return;
    void playLoginPageTurn(entry.snapshot, () => {
      window.scrollTo({ top: 0, behavior: "instant" });
    }, { duration: 820, leadIn: 0 });
  }, [location.key, location.pathname]);
}
