import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "../styles/heading-navigation.css";

function hashId(hash) {
  try { return decodeURIComponent(hash.slice(1)); } catch { return ""; }
}

function findHeading(id, scope = document) {
  const target = [...scope.querySelectorAll("h1[id],h2[id],h3[id],h4[id],h5[id],h6[id],.article-body-title-anchor[id],.heading-anchor-alias[id]")].find((element) => element.id === id);
  return target?.classList.contains("heading-anchor-alias") ? target.closest("h1,h2,h3,h4,h5,h6") : target;
}

function scrollOwner(element) {
  for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight) return parent;
  }
  return window;
}

export function HeadingNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const locationRef = useRef(location);
  locationRef.current = location;
  const skipHash = useRef(null);
  const cleanupRef = useRef(() => {});
  const returnRef = useRef(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let animation = 0;
    let highlightTimer = 0;
    let noticeTimer = 0;
    let releaseTarget = () => {};
    const stopAnimation = () => { window.cancelAnimationFrame(animation); animation = 0; };
    const clear = () => {
      stopAnimation();
      window.clearTimeout(highlightTimer);
      window.clearTimeout(noticeTimer);
      releaseTarget();
      returnRef.current = null;
    };
    cleanupRef.current = clear;
    const scroll = (owner, top, animate) => {
      stopAnimation();
      const start = owner === window ? window.scrollY : owner.scrollTop;
      const began = performance.now();
      const frame = (now) => {
        const progress = animate ? Math.min(1, (now - began) / 240) : 1;
        const eased = progress === 1 ? 1 : 1 - 2 ** (-10 * progress);
        owner.scrollTo({ top: start + (top - start) * eased, behavior: "instant" });
        if (progress < 1) animation = window.requestAnimationFrame(frame);
      };
      frame(began);
    };
    const dismissLater = () => {
      window.clearTimeout(noticeTimer);
      noticeTimer = window.setTimeout(() => {
        if (document.activeElement?.closest(".heading-jump-notice")) { dismissLater(); return; }
        setNotice(null);
        returnRef.current = null;
      }, 20000);
    };
    const highlight = (target) => {
      window.clearTimeout(highlightTimer);
      releaseTarget();
      const previousTabIndex = target.getAttribute("tabindex");
      target.setAttribute("tabindex", "-1");
      target.classList.add("heading-jump-target");
      target.focus({ preventScroll: true });
      releaseTarget = () => {
        target.classList.remove("heading-jump-target");
        if (previousTabIndex === null) target.removeAttribute("tabindex");
        else target.setAttribute("tabindex", previousTabIndex);
      };
      highlightTimer = window.setTimeout(releaseTarget, 1500);
    };
    const click = (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest?.("a[href]");
      if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self") || link.closest('[contenteditable="true"]')) return;
      let url;
      try { url = new URL(link.href, window.location.href); } catch { return; }
      if (!url.hash || url.origin !== window.location.origin || url.pathname !== window.location.pathname || url.search !== window.location.search) return;
      const scope = link.closest(".prose") || link.closest(".article-reading-page");
      if (!scope) return;
      const target = findHeading(hashId(url.hash), scope);
      if (!target) {
        if (url.hash.startsWith("#ym-h-")) {
          event.preventDefault();
          setNotice({ label: "这个标题已不存在，请继续浏览正文。" });
          returnRef.current = null;
          dismissLater();
        }
        return;
      }
      event.preventDefault();
      const owner = scrollOwner(target);
      const current = locationRef.current;
      const previous = { owner, top: owner === window ? window.scrollY : owner.scrollTop, link, url: `${current.pathname}${current.search}${current.hash}`, state: current.state };
      const top = target.getBoundingClientRect().top + (owner === window ? window.scrollY - (document.querySelector(".app-header")?.getBoundingClientRect().height || 68) - 24 : owner.scrollTop - owner.getBoundingClientRect().top - 20);
      const nextUrl = `${url.pathname}${url.search}${url.hash}`;
      if (nextUrl !== previous.url) {
        skipHash.current = nextUrl;
        navigate(nextUrl, { state: current.state, preventScrollReset: true });
      }
      scroll(owner, Math.max(0, top), !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      highlight(target);
      returnRef.current = () => {
        clear();
        skipHash.current = previous.url;
        navigate(previous.url, { replace: true, state: previous.state, preventScrollReset: true });
        if (previous.owner === window || previous.owner.isConnected) scroll(previous.owner, previous.top, !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
        if (previous.link.isConnected) previous.link.focus({ preventScroll: true });
        setNotice(null);
      };
      setNotice({ label: `已跳到：${target.textContent || "文章开头"}`, canReturn: true });
      dismissLater();
    };
    setNotice(null);
    document.addEventListener("click", click, true);
    window.addEventListener("wheel", stopAnimation, { passive: true });
    window.addEventListener("touchstart", stopAnimation, { passive: true });
    return () => {
      clear();
      document.removeEventListener("click", click, true);
      window.removeEventListener("wheel", stopAnimation);
      window.removeEventListener("touchstart", stopAnimation);
    };
  }, [navigate, location.pathname, location.search]);

  useEffect(() => {
    const currentUrl = `${location.pathname}${location.search}${location.hash}`;
    if (skipHash.current === currentUrl) { skipHash.current = null; return undefined; }
    cleanupRef.current();
    setNotice(null);
    if (!location.hash) return undefined;
    const id = hashId(location.hash);
    const locate = () => {
      const target = findHeading(id);
      if (!target) return false;
      target.scrollIntoView({ block: "start", behavior: "instant" });
      return true;
    };
    if (locate()) return undefined;
    const observer = new MutationObserver(() => { if (locate()) observer.disconnect(); });
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setTimeout(() => observer.disconnect(), 10000);
    return () => { observer.disconnect(); window.clearTimeout(timer); };
  }, [location.pathname, location.search, location.hash]);

  return notice ? <aside className="heading-jump-notice" aria-label="章节跳转">
    <span role="status">{notice.label}</span>
    {notice.canReturn ? <button type="button" onClick={() => returnRef.current?.()}>返回刚才位置</button> : null}
    <button type="button" aria-label="关闭章节跳转提示" onClick={() => { cleanupRef.current(); setNotice(null); }}>×</button>
  </aside> : null;
}
