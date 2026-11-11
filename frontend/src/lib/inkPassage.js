import { createInkScatter, prefersReducedMotion, sampleSvgTargets, smoothstep } from "./inkScatter";
import { inkSketchLibrary } from "./inkSketchLoader";

// Welcome → login: the page's words flake into ink dots, the welcome sheet
// gives way to the login page underneath, and the dots gather into the
// reading ink figure exactly where the login page draws it.
const SOURCES = ".landing-copy h1, .landing-lead, .landing-join, .landing-detail-list dt, .landing-detail-list dd, .landing-illustration svg";
const NAVIGATE_AT = 500;
const GATHER_AT = 880;
const FALLBACK_AT = 1500;
const SAFETY = 4200;

let active = null;

export function cancelInkPassage() { active?.finish(); }

function fallbackTargets(ink) {
  const markup = inkSketchLibrary()?.reader;
  if (!markup) return Promise.resolve(null);
  const holder = document.createElement("div");
  const width = Math.min(260, window.innerWidth * .6);
  Object.assign(holder.style, {
    position: "fixed", left: `${(window.innerWidth - width) / 2}px`, top: `${window.innerHeight * .28}px`,
    width: `${width}px`, color: ink, opacity: "0", pointerEvents: "none",
  });
  holder.setAttribute("aria-hidden", "true");
  holder.innerHTML = markup;
  const svg = holder.querySelector("svg");
  if (svg) Object.assign(svg.style, { display: "block", width: "100%", height: "auto" });
  document.body.append(holder);
  return sampleSvgTargets(svg).finally(() => holder.remove());
}

/** Returns false when the caller should navigate normally (reduced motion, no page). */
export function playWelcomeInk(page, navigate) {
  if (active) return true;
  if (!page || prefersReducedMotion() || !document.createElement("canvas").getContext) return false;

  const canvas = document.createElement("canvas");
  canvas.className = "ink-passage-canvas";
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, { width: `${window.innerWidth}px`, height: `${window.innerHeight}px` });
  const frame = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight, right: window.innerWidth, bottom: window.innerHeight };
  const pageStyle = getComputedStyle(page);
  const paper = pageStyle.backgroundColor && pageStyle.backgroundColor !== "rgba(0, 0, 0, 0)"
    ? pageStyle.backgroundColor : getComputedStyle(document.body).backgroundColor;
  const ink = getComputedStyle(page.querySelector(".landing-copy h1") || page).color;
  const sources = [...page.querySelectorAll(SOURCES)];
  const scatter = createInkScatter(canvas, frame, { ink, paper });

  let raf = 0;
  let start = 0;
  let navigated = false;
  let target = "none";
  let foundAt = 0;
  let done = false;
  let safety = 0;

  const go = () => {
    if (navigated) return;
    navigated = true;
    navigate();
  };
  const cleanup = () => {
    done = true;
    cancelAnimationFrame(raf);
    window.clearTimeout(safety);
    canvas.remove();
    window.removeEventListener("resize", finish);
    window.removeEventListener("popstate", back);
    document.removeEventListener("visibilitychange", hidden);
    if (active === controller) active = null;
  };
  function finish() {
    if (done) return;
    go();
    cleanup();
  }
  function back() {
    if (done) return;
    if (!navigated) sources.forEach((element) => { element.style.visibility = ""; });
    navigated = true;
    cleanup();
  }
  function hidden() { if (document.hidden) finish(); }
  const controller = { finish };
  active = controller;

  const aim = (points, t) => {
    if (done || !points?.length) return;
    target = "set";
    scatter.setTargets(points, { start: Math.max(t + 16, GATHER_AT), stagger: 300, duration: 720, size: 2.2 });
  };

  const tick = (now) => {
    if (done) return;
    const t = now - start;
    if (t >= NAVIGATE_AT) go();
    if (navigated && target === "none") {
      const svg = document.querySelector(".login-companion svg");
      const box = svg?.getBoundingClientRect();
      const fallback = () => fallbackTargets(ink).then((points) => {
        if (points?.length) aim(points, performance.now() - start);
        else finish();
      }, finish);
      if (box?.width && box.bottom > 0 && box.top < window.innerHeight) {
        foundAt ||= t;
        // Let the figure finish looking up before reading its outline.
        if (t - foundAt > 320) {
          target = "pending";
          sampleSvgTargets(svg).then((points) => (points.length ? aim(points, performance.now() - start) : fallback()), fallback);
        }
      } else if (t > FALLBACK_AT) {
        target = "pending";
        fallback();
      }
    }
    let backdrop = navigated ? 1 : smoothstep(30, NAVIGATE_AT - 40, t);
    let dots = 1;
    if (target === "set" && t > scatter.arrival + 140) {
      const fade = smoothstep(scatter.arrival + 140, scatter.arrival + 560, t);
      backdrop *= 1 - fade;
      dots = 1 - fade;
      if (fade >= 1) { cleanup(); return; }
    }
    scatter.draw(t, { backdrop, dots });
    raf = requestAnimationFrame(tick);
  };

  window.addEventListener("resize", finish);
  window.addEventListener("popstate", back);
  document.addEventListener("visibilitychange", hidden);
  safety = window.setTimeout(finish, SAFETY);

  (async () => {
    await Promise.race([document.fonts?.ready, new Promise((resolve) => { window.setTimeout(resolve, 200); })]);
    if (done) return;
    const count = await scatter.prepareSource(sources, { cellSize: 2.4, sweepStart: 0, sweepDuration: 560 });
    if (done) return;
    if (!count) { finish(); return; }
    document.body.append(canvas);
    sources.forEach((element) => { element.style.visibility = "hidden"; });
    start = performance.now();
    scatter.draw(0);
    raf = requestAnimationFrame(tick);
  })().catch(finish);

  return true;
}
