import { pageTurnFrame } from "./pageTurnGeometry";
import "../styles/login-page-turn.css";

let activeTurn;
const SVG_NS = "http://www.w3.org/2000/svg";
const TURN_DURATION = 820;

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

// Take a detached, inert visual copy before the auth context replaces the route.
// Replace fields instead of copying values, including a revealed password.
export function prepareLoginPageTurn(source, { submitLabel = "已登录" } = {}) {
  if (!source || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  try {
    const clone = source.cloneNode(true);
    clone.querySelectorAll("input, textarea, select").forEach((input) => {
      if ("value" in input) input.value = "";
      input.removeAttribute("value");
      const field = document.createElement("div");
      field.className = "login-turn-field";
      field.textContent = input.id === "login-password" ? "••••••••" : "已确认";
      input.replaceWith(field);
    });
    clone.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
    clone.removeAttribute("id");
    clone.querySelectorAll("[aria-describedby], [aria-controls], [for], [autofocus]").forEach((element) => {
      ["aria-describedby", "aria-controls", "for", "autofocus"].forEach((name) => element.removeAttribute(name));
    });
    clone.querySelectorAll("[contenteditable]").forEach((element) => element.removeAttribute("contenteditable"));
    clone.querySelectorAll(".login-error, .login-preview-controls").forEach((element) => element.remove());
    clone.querySelectorAll(".login-companion").forEach((element) => {
      element.dataset.pose = "turning";
      element.removeAttribute("style");
    });
    clone.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    const submit = clone.querySelector(".login-submit > span");
    if (submit) submit.textContent = submitLabel;
    const style = getComputedStyle(source);
    const bounds = source.getBoundingClientRect();
    clone.style.width = `${bounds.width}px`;
    clone.style.minHeight = `${bounds.height}px`;
    clone.style.margin = "0";
    clone.style.position = "absolute";
    clone.style.left = `${bounds.left}px`;
    clone.style.top = `${bounds.top}px`;
    return {
      clone, width: window.innerWidth, height: window.innerHeight,
      paper: style.backgroundColor, ink: style.color,
      dark: document.documentElement.dataset.theme === "dark",
    };
  } catch {
    return null;
  }
}

export function cancelLoginPageTurn() {
  activeTurn?.();
}

// Route navigation starts immediately under the old sheet. Animation failures
// always remove the sheet, restore access and leave the real route usable.
export function playLoginPageTurn(snapshot, navigate, { full = true, duration = TURN_DURATION, leadIn = 90 } = {}) {
  cancelLoginPageTurn();
  if (!snapshot || window.matchMedia("(prefers-reduced-motion: reduce)").matches
    || Math.abs(snapshot.width - window.innerWidth) > 1 || Math.abs(snapshot.height - window.innerHeight) > 80) {
    navigate();
    return Promise.resolve();
  }

  let overlay;
  try {
    overlay = document.createElement("div");
    overlay.className = "login-page-turn";
    overlay.dataset.mode = full ? "peel" : "fade";
    overlay.dataset.state = "preparing";
    overlay.setAttribute("aria-hidden", "true");
    overlay.inert = true;
    overlay.style.setProperty("--turn-paper", snapshot.paper);
    overlay.style.setProperty("--turn-ink", snapshot.ink);
    overlay.style.setProperty("--turn-back", snapshot.dark ? "#292d27" : "#eeede7");
    const front = document.createElement("div");
    front.className = "login-turn-front";
    front.append(snapshot.clone);
    overlay.append(front);

    const reverse = svgElement("svg", { viewBox: `0 0 ${snapshot.width} ${snapshot.height}`, preserveAspectRatio: "none" });
    reverse.classList.add("login-turn-reverse");
    const back = svgElement("polygon", { class: "login-turn-back" });
    const crease = svgElement("line", { class: "login-turn-crease" });
    reverse.append(back, crease);
    overlay.append(reverse);
    document.body.append(overlay);

    let frame = 0;
    let timeout;
    let finished = false;
    let resolveFinished;
    const completed = new Promise((resolve) => { resolveFinished = resolve; });
    const root = document.getElementById("root");
    const previousInert = root?.inert;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (root) root.inert = true;

    const preventScroll = (event) => event.preventDefault();
    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      window.removeEventListener("resize", finish);
      window.removeEventListener("popstate", finish);
      document.removeEventListener("visibilitychange", hidden);
      motion.removeEventListener("change", finish);
      document.removeEventListener("wheel", preventScroll);
      document.removeEventListener("touchmove", preventScroll);
      overlay.remove();
      if (root) root.inert = previousInert;
      if (activeTurn === finish) activeTurn = null;
      if (!document.hidden && (document.activeElement === document.body || document.activeElement === root)) {
        const heading = root?.querySelector("main h1");
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
    const hidden = () => { if (document.hidden) finish(); };
    activeTurn = finish;
    window.addEventListener("resize", finish, { once: true });
    window.addEventListener("popstate", finish, { once: true });
    document.addEventListener("visibilitychange", hidden);
    motion.addEventListener("change", finish, { once: true });
    document.addEventListener("wheel", preventScroll, { passive: false });
    document.addEventListener("touchmove", preventScroll, { passive: false });
    timeout = window.setTimeout(finish, Math.max(1400, duration + 500));

    const start = performance.now();
    const points = (polygon) => polygon.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
    const animate = (time) => {
      if (finished) return;
      try {
        const elapsed = time - start;
        const progress = Math.min(1, Math.max(0, (elapsed - (full ? leadIn : 0)) / (full ? Math.max(1, duration - leadIn) : 160)));
        overlay.dataset.state = "turning";
        overlay.dataset.progress = progress.toFixed(3);
        if (full) {
          const eased = progress * progress * (3 - 2 * progress);
          const geometry = pageTurnFrame(snapshot.width, snapshot.height, eased);
          front.style.clipPath = `polygon(${geometry.front.map(([x, y]) => `${x.toFixed(2)}px ${y.toFixed(2)}px`).join(",")})`;
          back.setAttribute("points", points(geometry.back));
          if (geometry.crease.length === 2) {
            const [[x1, y1], [x2, y2]] = geometry.crease;
            Object.entries({ x1, y1, x2, y2 }).forEach(([key, value]) => crease.setAttribute(key, value));
          }
        } else overlay.style.opacity = `${1 - progress}`;
        if (progress >= 1) finish();
        else frame = requestAnimationFrame(animate);
      } catch {
        finish();
      }
    };
    navigate();
    frame = requestAnimationFrame(animate);
    return completed;
  } catch {
    overlay?.remove();
    cancelLoginPageTurn();
    navigate();
    return Promise.resolve();
  }
}

if (import.meta.hot) import.meta.hot.dispose(cancelLoginPageTurn);
