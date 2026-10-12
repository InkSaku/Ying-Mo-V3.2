import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "yingmo-reading-panels-v1";
const MIN = { toc: 180, content: 480, rail: 160 };
const GAP = 52;

function readPreference() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(value?.toc) && Number.isFinite(value?.rail)) return value;
  } catch { /* Storage may be unavailable. */ }
  return null;
}

export function useReadingPanels(showToc) {
  const layoutRef = useRef(null);
  const dragRef = useRef(null);
  const [available, setAvailable] = useState(0);
  const [preference, setPreference] = useState(readPreference);
  const [dragging, setDragging] = useState(false);
  const gaps = showToc ? GAP * 2 : GAP;
  const space = available - gaps;
  const resizable = space >= MIN.content + MIN.rail + (showToc ? MIN.toc : 0);
  let toc = showToc ? Math.max(MIN.toc, preference?.toc ?? 210) : 0;
  let rail = Math.max(MIN.rail, preference?.rail ?? space - toc - 800);
  const excess = Math.max(0, toc + rail + MIN.content - space);
  const flexible = toc - (showToc ? MIN.toc : 0) + rail - MIN.rail;
  if (excess && flexible > 0) {
    const ratio = Math.min(1, excess / flexible);
    toc -= (toc - (showToc ? MIN.toc : 0)) * ratio;
    rail -= (rail - MIN.rail) * ratio;
  }
  const sizes = { toc, rail, content: space - toc - rail };

  useEffect(() => {
    const layout = layoutRef.current;
    const media = window.matchMedia("(min-width: 1360px)");
    const measure = () => setAvailable(media.matches ? layout.clientWidth : 0);
    const observer = new ResizeObserver(measure);
    observer.observe(layout);
    media.addEventListener("change", measure);
    measure();
    return () => {
      observer.disconnect();
      media.removeEventListener("change", measure);
    };
  }, []);

  useEffect(() => {
    try {
      if (preference) localStorage.setItem(STORAGE_KEY, JSON.stringify(preference));
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* Resizing works even when storage is unavailable. */ }
  }, [preference]);

  function resize(panel, value, base = sizes) {
    const other = panel === "toc" ? base.rail : base.toc;
    const maximum = space - MIN.content - other;
    setPreference({ toc: base.toc, rail: base.rail, [panel]: Math.min(maximum, Math.max(MIN[panel], value)) });
  }

  function separatorProps(panel) {
    return {
      role: "separator",
      tabIndex: resizable ? 0 : -1,
      "aria-label": panel === "toc" ? "调整目录与正文宽度" : "调整正文与阅读进度宽度",
      "aria-orientation": "vertical",
      "aria-valuemin": MIN[panel],
      "aria-valuemax": Math.round(space - MIN.content - (panel === "toc" ? rail : toc)),
      "aria-valuenow": Math.round(sizes[panel]),
      "aria-valuetext": `${Math.round(sizes[panel])} 像素`,
      title: "拖动调整宽度，双击恢复默认；方向键微调",
      onPointerDown(event) {
        if (!resizable || event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { panel, x: event.clientX, sizes, pointerId: event.pointerId };
        setDragging(true);
      },
      onPointerMove(event) {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId || !resizable) return;
        const delta = (event.clientX - drag.x) * (panel === "toc" ? 1 : -1);
        resize(panel, drag.sizes[panel] + delta, drag.sizes);
      },
      onPointerUp(event) {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        dragRef.current = null;
        setDragging(false);
      },
      onPointerCancel() { dragRef.current = null; setDragging(false); },
      onLostPointerCapture() { dragRef.current = null; setDragging(false); },
      onDoubleClick() { setPreference(null); },
      onKeyDown(event) {
        if (!resizable) return;
        const step = event.shiftKey ? 40 : 10;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          const direction = (event.key === "ArrowRight" ? 1 : -1) * (panel === "toc" ? 1 : -1);
          resize(panel, sizes[panel] + direction * step);
        } else if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          resize(panel, event.key === "Home" ? MIN[panel] : space);
        }
      },
    };
  }

  return {
    layoutRef, resizable, dragging, separatorProps,
    style: resizable ? { "--reading-toc-width": `${toc}px`, "--reading-rail-width": `${rail}px` } : undefined,
  };
}
