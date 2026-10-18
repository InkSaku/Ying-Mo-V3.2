import "../styles/paper-motion.css";

export const PAPER_EASE = "cubic-bezier(.16, 1, .3, 1)";

export function paperMotionAllowed() {
  return !document.hidden && typeof Element.prototype.animate === "function"
    && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Visual copies live outside the app, never receive focus, and expire even if a route fails.
export function visualLayer(kind) {
  const layer = document.createElement("div");
  layer.className = `paper-motion-layer is-${kind}`;
  layer.setAttribute("aria-hidden", "true");
  layer.inert = true;
  document.body.append(layer);
  const animations = [];
  const restorers = [];
  const controller = new AbortController();
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    window.clearTimeout(timer);
    controller.abort();
    motion.removeEventListener("change", finish);
    animations.forEach((animation) => animation.cancel());
    restorers.forEach((restore) => restore());
    layer.remove();
  };
  const timer = window.setTimeout(finish, 1500);
  for (const event of ["resize", "popstate", "pagehide", "wheel", "touchmove", "pointerdown", "keydown"]) {
    window.addEventListener(event, finish, { signal: controller.signal, passive: true });
  }
  document.addEventListener("visibilitychange", finish, { signal: controller.signal });
  motion.addEventListener("change", finish);
  return {
    layer, finish,
    get active() { return !done; },
    hide(element) {
      const previous = element.style.visibility;
      element.style.visibility = "hidden";
      restorers.push(() => { element.style.visibility = previous; });
    },
    animate(element, frames, options) {
      const animation = element.animate(frames, options);
      animations.push(animation);
      return animation;
    },
  };
}

export function fitRect(element, rect) {
  Object.assign(element.style, {
    position: "absolute", left: `${rect.left}px`, top: `${rect.top}px`,
    width: `${rect.width}px`, height: `${rect.height}px`, margin: "0",
  });
}
