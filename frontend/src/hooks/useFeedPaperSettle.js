import { useEffect, useRef } from "react";
import { paperMotionAllowed } from "../lib/paperMotion";

// 手机首页时间流的“纸页落座”：记录第一次从屏幕下方进入时，像一张纸被放到桌上——
// 从下方略微倾斜着升起，轻轻越过一点再落定。每条记录在本次打开里只落一次；
// 一开始就在屏幕上、恢复滚动位置后出现、从上方滑回或被键盘聚焦的记录直接显示。
const PHONE_QUERY = "(max-width: 767px)";
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
const ITEM_SELECTOR = ".home-feed-stream > :is(.home-feed-entry, .home-feed-interlude-row, .home-feed-collections)";
// 分段缓动：前 60% 柔和升起并越过约 3px，后 40% 落定。全局 PAPER_EASE 太急，会把落座压成一闪。
const FRAMES = [
  { opacity: 0, transform: "translateY(44px) rotate(-2deg)", easing: "cubic-bezier(.3, .6, .35, 1)" },
  { opacity: 1, transform: "translateY(-4px) rotate(.35deg)", offset: .6, easing: "cubic-bezier(.4, 0, .4, 1)" },
  { opacity: 1, transform: "none" },
];
const DURATION = 620;
const STAGGER = 70;
const settled = new Set();

function itemKey(node) {
  if (node.dataset.feedPostId) return `post:${node.dataset.feedPostId}`;
  if (node.classList.contains("home-feed-collections")) return "collections";
  if (node.classList.contains("home-feed-interlude-row")) return "memory";
  return "";
}

export function useFeedPaperSettle(rootRef, version) {
  const controllerRef = useRef(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined" || !paperMotionAllowed()) return undefined;
    const phone = window.matchMedia(PHONE_QUERY);
    const reduced = window.matchMedia(REDUCED_QUERY);
    if (!phone.matches) return undefined;

    const held = new Map();
    let batch = 0;
    const release = (node, play) => {
      const animation = held.get(node);
      if (!animation) return;
      held.delete(node);
      reveal.unobserve(node);
      if (!play) {
        animation.cancel();
        return;
      }
      animation.effect.updateTiming({ delay: Math.min(batch, 3) * STAGGER });
      batch += 1;
      animation.play();
    };
    // 进入屏幕底部约 8% 以上才开始落座；从上方回来的直接显示。
    const reveal = new IntersectionObserver((entries) => {
      batch = 0;
      for (const entry of entries) {
        if (entry.isIntersecting) release(entry.target, entry.boundingClientRect.top > window.innerHeight * .45);
      }
    }, { rootMargin: "0px 0px -8% 0px" });
    // 接近屏幕底部时先把纸“拿在手里”（停在第一帧），已在屏幕上的直接记为落过。
    const approach = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const node = entry.target;
        approach.unobserve(node);
        const key = itemKey(node);
        if (!key || settled.has(key)) continue;
        settled.add(key);
        if (entry.boundingClientRect.top < window.innerHeight) continue;
        const animation = node.animate(FRAMES, { duration: DURATION, easing: "linear", fill: "backwards" });
        animation.pause();
        held.set(node, animation);
        reveal.observe(node);
      }
    }, { rootMargin: "0px 0px 25% 0px" });

    const showAll = () => {
      for (const node of [...held.keys()]) release(node, false);
    };
    const stop = () => {
      showAll();
      approach.disconnect();
      reveal.disconnect();
      controllerRef.current = null;
    };
    const onFocus = (event) => {
      const node = event.target.closest?.(ITEM_SELECTOR);
      if (node) release(node, false);
    };
    root.addEventListener("focusin", onFocus);
    window.addEventListener("beforeprint", showAll);
    phone.addEventListener("change", stop);
    reduced.addEventListener("change", stop);
    controllerRef.current = { observe: (node) => approach.observe(node) };

    return () => {
      root.removeEventListener("focusin", onFocus);
      window.removeEventListener("beforeprint", showAll);
      phone.removeEventListener("change", stop);
      reduced.removeEventListener("change", stop);
      stop();
    };
  }, [rootRef]);

  // 无限加载追加的记录和插页也加入观察；同一节点重复观察不会重复触发。
  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller || !rootRef.current) return;
    rootRef.current.querySelectorAll(ITEM_SELECTOR).forEach((node) => controller.observe(node));
  }, [rootRef, version]);
}
