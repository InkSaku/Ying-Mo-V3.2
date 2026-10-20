/*! Paper tear geometry adapted from Codrops Interlude, Copyright (c) 2026 Codrops, MIT.
 * https://github.com/codrops/interlude/blob/main/src/transitions/tear.ts
 * Full notice: /licenses/interlude-MIT.txt. React lifecycle and native rAF adaptation for Ying Mo.
 */
import { cancelLoginPageTurn } from "./loginPageTurn";
import "../styles/page-tear.css";

const ROWS = 80;
const CRACK_MS = 700;
const PART_MS = 1200;
let activeTear;
const px = (x, y) => `${x.toFixed(1)}px ${y.toFixed(1)}px`;

function tearLine(x, width, height) {
  const waves = [1, 2.3, 5.1].map((frequency, i) => ({
    frequency, phase: Math.random() * Math.PI * 2, size: width * .09 / (i + 1) / 1.6,
  }));
  const xs = [], rims = [];
  for (let i = 0; i <= ROWS; i++) {
    const t = i / ROWS;
    const wave = waves.reduce((sum, w) => sum + Math.sin(t * w.frequency * Math.PI + w.phase) * w.size, 0);
    xs.push(Math.min(width - 12, Math.max(12, x + wave + (Math.random() - .5) * 6)));
    rims.push(3 + Math.random() * 4 + (Math.random() < .12 ? 6 + Math.random() * 6 : 0));
  }
  return { xs, rims, width, height };
}

function half({ xs, width, height }, side) {
  const edge = xs.map((x, i) => px(x, i / ROWS * height));
  const outside = side < 0 ? [px(0, height), px(0, 0)] : [px(width, height), px(width, 0)];
  return `polygon(${[...edge, ...outside].join(",")})`;
}

function rim({ xs, rims, height }, side, reach) {
  const edge = xs.map((x, i) => px(x + side * rims[i] * Math.min(1, Math.max(0, (reach - i) / 3)), i / ROWS * height));
  const line = xs.map((x, i) => px(x, i / ROWS * height)).reverse();
  return `polygon(${[...edge, ...line].join(",")})`;
}

function layer(className, parent) {
  const element = document.createElement("div");
  element.className = className;
  parent.append(element);
  return element;
}

export function cancelPageTear() { activeTear?.(); }

export function playPageTear(snapshot, navigate, { originX } = {}) {
  cancelPageTear();
  cancelLoginPageTurn();
  if (!snapshot || document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches
    || Math.abs(snapshot.width - innerWidth) > 1 || Math.abs(snapshot.height - innerHeight) > 80) {
    navigate();
    return Promise.resolve();
  }
  const root = document.getElementById("root");
  const previousInert = root?.inert;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const cleanup = new AbortController();
  let overlay, frame, timer, finished = false, navigated = false, resolveFinished;
  const complete = new Promise((resolve) => { resolveFinished = resolve; });
  const finish = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(frame);
    window.clearTimeout(timer);
    cleanup.abort();
    overlay?.remove();
    if (root) root.inert = previousInert;
    if (activeTear === finish) activeTear = null;
    if (!document.hidden && root?.isConnected) {
      const heading = root.querySelector("main h1");
      if (heading) {
        const original = heading.getAttribute("tabindex");
        heading.setAttribute("tabindex", "-1");
        heading.focus({ preventScroll: true });
        heading.addEventListener("blur", () => {
          if (original === null) heading.removeAttribute("tabindex");
          else heading.setAttribute("tabindex", original);
        }, { once: true });
      }
    }
    resolveFinished();
  };

  try {
    overlay = document.createElement("div");
    overlay.className = "page-tear";
    overlay.setAttribute("aria-hidden", "true");
    overlay.inert = true;
    overlay.style.setProperty("--tear-paper", snapshot.paper);
    overlay.style.setProperty("--tear-rim", snapshot.dark ? "#343930" : "#f1eee5");
    overlay.style.setProperty("--tear-ink", snapshot.ink);
    const shape = tearLine(Math.min(snapshot.width * .75, Math.max(snapshot.width * .25, originX ?? snapshot.width * .52)), snapshot.width, snapshot.height);
    const halves = [-1, 1].map((side) => {
      const holder = layer("page-tear-half", overlay);
      const page = layer("page-tear-copy", holder);
      page.style.clipPath = half(shape, side);
      page.append(side < 0 ? snapshot.clone : snapshot.clone.cloneNode(true));
      const edge = layer("page-tear-edge", layer("page-tear-edge-shadow", holder));
      holder.style.transformOrigin = px(shape.xs[ROWS], snapshot.height);
      return { holder, edge, side };
    });
    document.body.append(overlay);
    if (root) root.inert = true;
    activeTear = finish;
    for (const event of ["resize", "popstate", "pagehide"]) window.addEventListener(event, finish, { signal: cleanup.signal });
    document.addEventListener("visibilitychange", () => { if (document.hidden) finish(); }, { signal: cleanup.signal });
    motion.addEventListener("change", finish, { signal: cleanup.signal });
    const preventScroll = (event) => event.preventDefault();
    for (const event of ["wheel", "touchmove"]) document.addEventListener(event, preventScroll, { passive: false, signal: cleanup.signal });
    timer = window.setTimeout(finish, 3200);
    const start = performance.now();
    const apart = Math.max(Math.max(...shape.xs), snapshot.width - Math.min(...shape.xs)) + 80;
    const animate = (now) => {
      if (finished) return;
      try {
        const elapsed = now - start;
        const crack = Math.min(1, elapsed / CRACK_MS);
        const part = Math.max(0, Math.min(1, (elapsed - CRACK_MS) / PART_MS));
        const eased = part < .5 ? 8 * part ** 4 : 1 - 8 * (1 - part) ** 4;
        overlay.dataset.phase = part > 0 ? "parting" : "tearing";
        overlay.dataset.progress = part.toFixed(3);
        for (const { holder, edge, side } of halves) {
          edge.style.clipPath = rim(shape, -side, (ROWS + 3) * crack ** 2);
          holder.style.transform = `translateX(${side * apart * eased}px) rotate(${side * 4 * eased}deg)`;
          holder.style.filter = part > 0 ? `drop-shadow(0 18px 30px rgb(0 0 0 / ${Math.min(.3, part)}))` : "none";
        }
        if (part >= 1) finish();
        else frame = requestAnimationFrame(animate);
      } catch { finish(); }
    };
    navigated = true;
    navigate();
    frame = requestAnimationFrame(animate);
    return complete;
  } catch {
    finish();
    if (!navigated) navigate();
    return complete;
  }
}

if (import.meta.hot) import.meta.hot.dispose(cancelPageTear);
