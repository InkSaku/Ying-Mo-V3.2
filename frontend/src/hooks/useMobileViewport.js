import { useEffect } from "react";

const NON_TEXT_INPUTS = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);

function isTextEntry(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;
  if (element instanceof HTMLTextAreaElement) return !element.disabled && !element.readOnly;
  return element instanceof HTMLInputElement && !element.disabled && !element.readOnly && !NON_TEXT_INPUTS.has(element.type);
}

export function useMobileViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;
    const touch = window.matchMedia("(any-pointer: coarse)");
    const root = document.documentElement;
    const properties = ["--mobile-keyboard-inset", "--mobile-viewport-height", "--mobile-viewport-top"];
    let baselineHeight = window.innerHeight;
    let width = window.innerWidth;
    let frame = 0;

    const clear = () => {
      root.removeAttribute("data-mobile-keyboard");
      properties.forEach((property) => root.style.removeProperty(property));
    };
    const update = () => {
      frame = 0;
      if (window.innerWidth !== width) {
        width = window.innerWidth;
        baselineHeight = window.innerHeight;
      }
      const editing = isTextEntry(document.activeElement);
      baselineHeight = editing
        ? Math.max(baselineHeight, window.innerHeight, viewport.height)
        : Math.max(window.innerHeight, viewport.height);
      // Layout-resizing keyboards need no inset; Safari may resize only the visual viewport.
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      const keyboardOpen = touch.matches && editing
        && Math.abs(viewport.scale - 1) < 0.01
        && (inset > 120 || baselineHeight - viewport.height > 120);
      if (!keyboardOpen) {
        clear();
        return;
      }
      root.dataset.mobileKeyboard = "open";
      const values = [inset, viewport.height, viewport.offsetTop];
      properties.forEach((property, index) => {
        const value = `${Math.round(values[index])}px`;
        if (root.style.getPropertyValue(property) !== value) root.style.setProperty(property, value);
      });
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    touch.addEventListener("change", schedule);
    update();
    return () => {
      window.cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
      touch.removeEventListener("change", schedule);
      clear();
    };
  }, []);
}
