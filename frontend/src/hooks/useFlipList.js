import { useEffect, useLayoutEffect, useRef } from "react";
import { PAPER_EASE, paperMotionAllowed } from "../lib/paperMotion";

const MOVE_MS = 360;

function measure(container) {
  const base = container.getBoundingClientRect();
  const entries = new Map();
  for (const node of container.querySelectorAll("[data-flip-key]")) {
    const rect = node.getBoundingClientRect();
    entries.set(node.dataset.flipKey, {
      node,
      rect: { left: rect.left - base.left, top: rect.top - base.top, width: rect.width, height: rect.height },
    });
  }
  return entries;
}

/**
 * 列表筛选时的 FLIP：留下的条目从旧位置滑到新位置，新出现的淡入，离开的由一份不可交互的副本在原处淡出。
 * 条目用 data-flip-key 标记，位置相对容器记录，容器需要是定位元素。首次渲染和减少动态时不播放。
 */
export function useFlipList(containerRef, signature, { exit, enter } = {}) {
  const memory = useRef(new Map());
  const motion = useRef({ exit, enter });
  motion.current = { exit, enter };

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      memory.current = new Map();
      return;
    }
    const previous = memory.current;
    const next = measure(container);
    memory.current = next;
    if (!previous.size || !paperMotionAllowed()) return;
    const { exit: exitFrames, enter: enterFrames } = motion.current;
    for (const [key, entry] of next) {
      const before = previous.get(key);
      if (!before) {
        entry.node.animate(enterFrames || [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], {
          duration: 280, delay: 120, easing: PAPER_EASE, fill: "backwards",
        });
        continue;
      }
      const dx = before.rect.left - entry.rect.left;
      const dy = before.rect.top - entry.rect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      entry.node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: MOVE_MS, easing: PAPER_EASE });
    }
    for (const [key, entry] of previous) {
      if (next.has(key)) continue;
      // React 已经把旧节点移走，用它的副本在原位置播放离场，结束后移除。
      const ghost = entry.node.cloneNode(true);
      ghost.removeAttribute("data-flip-key");
      for (const element of [ghost, ...ghost.querySelectorAll("[id]")]) element.removeAttribute("id");
      ghost.setAttribute("aria-hidden", "true");
      ghost.inert = true;
      ghost.classList.add("flip-ghost");
      Object.assign(ghost.style, {
        position: "absolute", left: `${entry.rect.left}px`, top: `${entry.rect.top}px`,
        width: `${entry.rect.width}px`, height: `${entry.rect.height}px`, margin: "0", pointerEvents: "none", zIndex: "1",
      });
      container.append(ghost);
      const animation = ghost.animate(exitFrames || [{ opacity: 1 }, { opacity: 0, transform: "translateY(-8px)" }], {
        duration: 260, easing: "cubic-bezier(.4, 0, .2, 1)", fill: "forwards",
      });
      animation.finished.then(() => ghost.remove(), () => ghost.remove());
    }
  }, [containerRef, signature]);

  // 窗口尺寸变化会改排版，但不会触发渲染；重新量一次，下次筛选才从正确的位置出发。
  useEffect(() => {
    const remeasure = () => {
      if (containerRef.current) memory.current = measure(containerRef.current);
    };
    window.addEventListener("resize", remeasure);
    return () => window.removeEventListener("resize", remeasure);
  }, [containerRef]);
}
