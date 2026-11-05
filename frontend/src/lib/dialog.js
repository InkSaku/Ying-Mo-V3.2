let scrollLocks = 0;
let restoreScrollStyles;

// A child dialog must not unlock the page while its parent is still open.
export function lockPageScroll() {
  if (scrollLocks++ === 0) {
    const elements = [document.documentElement, document.body];
    const previous = elements.map((element) => [element.style.overflow, element.style.overscrollBehavior]);
    elements.forEach((element) => {
      element.style.overflow = "hidden";
      element.style.overscrollBehavior = "none";
    });
    restoreScrollStyles = () => elements.forEach((element, index) => {
      [element.style.overflow, element.style.overscrollBehavior] = previous[index];
    });
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--scrollLocks === 0) restoreScrollStyles?.();
  };
}

export function dialogControls(panel) {
  const controls = [...(panel?.querySelectorAll("button, a[href], input, select, textarea, summary, [tabindex], [contenteditable='true']") || [])]
    .filter((element) => element.tabIndex >= 0 && !element.matches(":disabled")
      && !element.closest("[inert]") && element.getClientRects().length
      && element.checkVisibility?.({ checkVisibilityCSS: true, checkOpacity: true }) !== false
      && (!element.closest("details:not([open])") || element.closest("details:not([open])").querySelector("summary")?.contains(element))
      && getComputedStyle(element).visibility !== "hidden");
  return controls.filter((element) => element.type !== "radio" || !element.name
    || !controls.some((other) => other.type === "radio" && other.name === element.name && other.form === element.form && other.checked)
    || element.checked);
}
