import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import atlas from "../assets/ink/margin-objects-v1.webp";
import boat from "../assets/ink/letter-boat-v1.webp";
import "../styles/home-margin-objects.css";

const HIDDEN_KEY = "yingmo:home-margin-objects:hidden";
const MOTIFS = [
  { id: "boat", name: "信纸小船", image: boat },
  { id: "pencil", name: "铅笔花", cell: 0 },
  { id: "tea", name: "聊天茶杯", cell: 1 },
  { id: "camera", name: "相机与心形肩带", cell: 2 },
  { id: "envelope", name: "信封小山", cell: 3 },
  { id: "film", name: "卷起的胶片", cell: 4 },
  { id: "book", name: "书页小路", cell: 5 },
];

const OBSTACLES = [
  "h1", "h2", "h3", "h4", "p", "a", "button", "input", "textarea", "select", "summary", "figure",
  "[data-margin-avoid]", ".story-byline", ".quick-note-composer", ".home-opening-feature-visual", ".home-edition-cue",
  ".home-feed-toolbar", ".home-feed-entry", ".home-feed-interlude-row", ".home-closing-memory",
  ".home-closing-collections", ".home-margin-tools",
].join(",");

function readHidden() {
  try { return window.sessionStorage.getItem(HIDDEN_KEY) === "1"; } catch { return false; }
}

function shuffled(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function pageBox(element) {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + window.scrollX, y: rect.top + window.scrollY, w: rect.width, h: rect.height };
}

function intersects(a, b, gap = 0) {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x
    && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

function makeArtwork(motif) {
  const visual = document.createElement("span");
  visual.className = "home-margin-object-art";
  visual.setAttribute("aria-hidden", "true");
  visual.style.transform = `rotate(${Math.round(Math.random() * 12 - 6)}deg)`;
  if (motif.image) {
    const image = document.createElement("img");
    image.src = motif.image;
    image.alt = "";
    image.draggable = false;
    image.width = 1536;
    image.height = 1024;
    visual.append(image);
  } else {
    const namespace = "http://www.w3.org/2000/svg";
    const view = document.createElementNS(namespace, "svg");
    const image = document.createElementNS(namespace, "image");
    const row = Math.floor(motif.cell / 3);
    // Source rectangles contain every complete nib, strap, and paper edge.
    view.setAttribute("viewBox", `${motif.cell % 3 * 512} ${row ? 550 : 0} 512 ${row ? 474 : 550}`);
    view.setAttribute("preserveAspectRatio", "xMidYMid meet");
    view.setAttribute("focusable", "false");
    image.setAttribute("href", atlas);
    image.setAttribute("width", "1536");
    image.setAttribute("height", "1024");
    view.append(image);
    visual.append(view);
  }
  return visual;
}

export function HomeMarginObjects({ boundaryRef }) {
  const layerRef = useRef(null);
  const controllerRef = useRef(null);
  const [hidden, setHidden] = useState(readHidden);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const root = boundaryRef.current;
    const layer = layerRef.current;
    if (!root || !layer) return undefined;

    const finePointer = window.matchMedia("(hover:hover) and (pointer:fine)");
    let selection = shuffled(MOTIFS);
    let items = [];
    let obstacles = [];
    let boundary;
    let frame = 0;
    let drag = null;
    let disposed = false;

    const collectObstacles = () => {
      boundary = pageBox(root);
      obstacles = [...root.querySelectorAll(OBSTACLES)]
        .filter((element) => !element.closest("dialog") && element.getClientRects().length)
        .map(pageBox)
        .filter((rect) => rect.w > 0 && rect.h > 0);
    };

    const isClear = (item, x, y, ignore, activeObstacles = obstacles) => {
      const rect = { x, y, w: item.size, h: item.size };
      const width = document.documentElement.clientWidth;
      if (x < 8 || x + item.size > width - 8 || y < boundary.y + 8
        || y + item.size > boundary.y + boundary.h - 12) return false;
      if (activeObstacles.some((obstacle) => intersects(rect, obstacle, 8))) return false;
      return !items.some((other) => other !== ignore && intersects(rect, {
        x: other.x, y: other.y, w: other.size, h: other.size,
      }, 16));
    };

    const paint = (item) => {
      item.element.style.transform = `translate3d(${Math.round(item.x)}px,${Math.round(item.y)}px,0)`;
    };

    const move = (item, x, y) => {
      if (!isClear(item, x, y, item)) return;
      item.x = x;
      item.y = y;
      paint(item);
    };

    const stopDrag = () => {
      if (!drag) return;
      drag.item.element.classList.remove("is-grabbed");
      drag = null;
    };

    const wire = (item) => {
      const element = item.element;
      element.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || !finePointer.matches) return;
        collectObstacles();
        drag = { item, pointer: event.pointerId, x: event.pageX - item.x, y: event.pageY - item.y };
        element.setPointerCapture(event.pointerId);
        element.classList.add("is-grabbed");
        event.preventDefault();
      });
      element.addEventListener("pointermove", (event) => {
        if (drag?.item !== item || drag.pointer !== event.pointerId) return;
        move(item, event.pageX - drag.x, event.pageY - drag.y);
      });
      element.addEventListener("pointerup", stopDrag);
      element.addEventListener("pointercancel", stopDrag);
      element.addEventListener("lostpointercapture", stopDrag);
      element.addEventListener("keydown", (event) => {
        const delta = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] }[event.key];
        if (!delta && event.key !== "Home" && event.key !== "Escape") return;
        event.preventDefault();
        collectObstacles();
        if (delta) move(item, item.x + delta[0], item.y + delta[1]);
        else move(item, item.homeX, item.homeY);
      });
    };

    const candidates = (item, region) => {
      const result = [];
      if (!region || region.w < item.size || region.h < item.size) return result;
      const nearby = obstacles.filter((obstacle) => intersects(region, obstacle, 16));
      for (let y = region.y; y <= region.y + region.h - item.size; y += 20) {
        for (let x = region.x; x <= region.x + region.w - item.size; x += 20) {
          if (isClear(item, x, y, undefined, nearby)) result.push({ x, y });
        }
      }
      return result;
    };

    const layout = () => {
      frame = 0;
      if (disposed) return;
      stopDrag();
      layer.replaceChildren();
      items = [];
      collectObstacles();
      layer.style.height = `${Math.ceil(boundary.y + boundary.h)}px`;
      const width = document.documentElement.clientWidth;
      const narrow = width < 900;
      const wide = width >= 1200;
      const count = narrow ? 2 : wide ? 5 : 3;
      const boxFor = (selector) => {
        const element = root.querySelector(selector);
        if (!element) return null;
        const box = pageBox(element);
        return { ...box, h: Math.min(box.h, window.innerHeight * 1.5, 1600) };
      };
      const copy = boxFor(".home-edition-copy");
      const reading = boxFor(".home-reading-column");
      const aside = boxFor(".home-side-rail");
      const pockets = ["opening", "aside"].map((name) => boxFor(`[data-home-margin-pocket="${name}"]`));
      const contentLeft = boundary.x + parseFloat(window.getComputedStyle(root).paddingLeft);
      const contentRight = boundary.x + boundary.w - parseFloat(window.getComputedStyle(root).paddingRight);
      const regions = {
        left: { x: 12, y: boundary.y + 100, w: Math.max(0, contentLeft - 28), h: Math.min(440, boundary.h - 150) },
        right: { x: contentRight + 16, y: boundary.y + 150, w: Math.max(0, width - contentRight - 28), h: Math.min(380, boundary.h - 200) },
        copy, reading, aside,
        openingPocket: pockets[0] && { x: pockets[0].x + 6, y: pockets[0].y + 8, w: pockets[0].w - 12, h: pockets[0].h - 16 },
        asidePocket: pockets[1] && { x: pockets[1].x + 6, y: pockets[1].y + 8, w: pockets[1].w - 12, h: pockets[1].h - 16 },
      };
      const preferred = narrow ? ["openingPocket", "asidePocket"]
        : wide ? ["copy", "right", "reading", "aside", "left"] : ["copy", "reading", "aside"];

      for (let index = 0; index < count; index++) {
        const motif = selection[index];
        const item = { ...motif, size: narrow ? 72 : [88, 80, 84, 86, 78][index] };
        const order = narrow ? [preferred[index]] : [preferred[index], ...shuffled(Object.keys(regions).filter((key) => key !== preferred[index]))];
        let point;
        for (const key of order) {
          const options = candidates(item, regions[key]);
          if (options.length) { point = options[Math.floor(Math.random() * options.length)]; break; }
        }
        if (!point) continue;
        item.x = item.homeX = point.x;
        item.y = item.homeY = point.y;
        item.element = document.createElement(finePointer.matches ? "button" : "span");
        item.element.className = "home-margin-object";
        item.element.style.width = `${item.size}px`;
        item.element.style.height = `${item.size}px`;
        if (finePointer.matches) {
          item.element.type = "button";
          item.element.title = `${item.name} · 可以拖动`;
          item.element.setAttribute("aria-label", `移动页边小物：${item.name}。方向键移动，Home 归位。`);
          wire(item);
        } else item.element.setAttribute("aria-hidden", "true");
        item.element.append(makeArtwork(motif));
        items.push(item);
        layer.append(item.element);
        paint(item);
      }
    };

    const schedule = () => { if (!frame && !disposed) frame = window.requestAnimationFrame(layout); };
    const onVisibility = () => { if (document.hidden) stopDrag(); };
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(root);
    const mutationObserver = new MutationObserver((records) => {
      if (records.some(({ target }) => {
        const element = target instanceof Element ? target : target.parentElement;
        return !element?.closest("[data-home-margin-ui]");
      })) schedule();
    });
    mutationObserver.observe(root, { childList: true, subtree: true });
    finePointer.addEventListener("change", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("blur", stopDrag);
    window.addEventListener("pagehide", stopDrag);
    document.addEventListener("visibilitychange", onVisibility);
    document.fonts.ready.then(schedule);
    controllerRef.current = { shuffle: () => { selection = shuffled(MOTIFS); schedule(); }, stop: stopDrag };
    schedule();

    return () => {
      disposed = true;
      stopDrag();
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      finePointer.removeEventListener("change", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("blur", stopDrag);
      window.removeEventListener("pagehide", stopDrag);
      document.removeEventListener("visibilitychange", onVisibility);
      layer.replaceChildren();
      controllerRef.current = null;
    };
  }, [boundaryRef]);

  const shuffle = () => {
    controllerRef.current?.shuffle();
    setAnnouncement("换好了一组小物，文章排版保持不变。");
  };

  const toggle = () => {
    const next = !hidden;
    controllerRef.current?.stop();
    setHidden(next);
    setAnnouncement(next ? "页边小物已收起。" : "页边小物已显示。");
    try { window.sessionStorage.setItem(HIDDEN_KEY, next ? "1" : "0"); } catch { /* Cosmetic preference only. */ }
  };

  return <>
    <div className="home-margin-controls" data-home-margin-ui>
      <div className="home-margin-tools" data-margin-avoid>
        <button type="button" onClick={shuffle} disabled={hidden}>换一组小物</button>
        <button type="button" onClick={toggle} aria-pressed={hidden}>{hidden ? "显示小物" : "收起小物"}</button>
        <span className="sr-only" role="status">{announcement}</span>
      </div>
      <span className="home-margin-pocket" data-home-margin-pocket="opening" aria-hidden="true" />
    </div>
    {createPortal(<div ref={layerRef} className="home-margin-layer" hidden={hidden} role="group" aria-label="可移动的页边小物" />, document.body)}
  </>;
}
