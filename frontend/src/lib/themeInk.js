import { inkRevealKeyframes } from "./themeInkGeometry";
import "../styles/theme-ink.css";

let activeInk;

export function cancelThemeInk() {
  activeInk?.();
}

// The browser captures the real page, including media and form state. No DOM
// copies or image colour filters; only the new theme's visible area changes.
export function playThemeInk(update, { origin, theme } = {}) {
  cancelThemeInk();
  const root = document.documentElement;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (!document.startViewTransition || motion.matches || document.hidden || document.querySelector(".login-page-turn")) {
    update();
    return;
  }

  let applied = false;
  let finished = false;
  let transition;
  let animation;
  let timeout;
  const apply = () => { if (!applied) { applied = true; update(); } };
  const finish = () => {
    if (finished) return;
    finished = true;
    // Even cancellation before the browser captures a frame applies the choice.
    apply();
    transition?.skipTransition();
    animation?.cancel();
    clearTimeout(timeout);
    window.removeEventListener("resize", finish);
    window.removeEventListener("scroll", finish, true);
    window.removeEventListener("popstate", finish);
    document.removeEventListener("visibilitychange", hidden);
    document.removeEventListener("pointerdown", finish, true);
    document.removeEventListener("keydown", keydown, true);
    motion.removeEventListener("change", finish);
    if (activeInk === finish) {
      activeInk = null;
      delete root.dataset.themeInk;
      root.style.removeProperty("--ink-x");
      root.style.removeProperty("--ink-y");
    }
  };
  const hidden = () => { if (document.hidden) finish(); };
  const keydown = (event) => { if (["Escape", "Tab", "Enter", " "].includes(event.key)) finish(); };
  activeInk = finish;
  root.dataset.themeInk = theme;
  root.style.setProperty("--ink-x", `${origin?.x ?? innerWidth / 2}px`);
  root.style.setProperty("--ink-y", `${origin?.y ?? innerHeight / 2}px`);
  window.addEventListener("resize", finish, { once: true });
  window.addEventListener("scroll", finish, true);
  window.addEventListener("popstate", finish, { once: true });
  document.addEventListener("visibilitychange", hidden);
  document.addEventListener("pointerdown", finish, true);
  document.addEventListener("keydown", keydown, true);
  motion.addEventListener("change", finish, { once: true });
  timeout = window.setTimeout(finish, 1400);

  try {
    const frames = inkRevealKeyframes(innerWidth, innerHeight, origin);
    transition = document.startViewTransition(apply);
    void transition.ready.then(() => {
      if (finished) return;
      animation = root.animate(frames, {
        duration: 560, easing: "linear", fill: "both", pseudoElement: "::view-transition-new(root)",
      });
      void animation.finished.then(finish, finish);
    }).catch(finish);
    void transition.finished.then(finish, finish);
    // A failed capture must never discard the user's theme preference.
    void transition.updateCallbackDone.catch(finish);
  } catch {
    finish();
  }
}

if (import.meta.hot) import.meta.hot.dispose(cancelThemeInk);
