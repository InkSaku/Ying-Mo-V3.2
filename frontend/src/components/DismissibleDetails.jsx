import { useEffect, useRef } from "react";

export function DismissibleDetails({ children, className }) {
  const ref = useRef(null);
  const positionMenu = () => {
    const details = ref.current;
    if (!details?.open) return;
    const menu = details.querySelector(":scope > div");
    const anchor = details.querySelector("summary");
    if (!menu || !anchor) return;
    const viewport = window.visualViewport;
    const style = getComputedStyle(document.documentElement);
    const inset = (edge) => Math.max(12, parseFloat(style.getPropertyValue(`--safe-area-${edge}`)) || 0);
    let top = (viewport?.offsetTop || 0) + inset("top");
    const left = (viewport?.offsetLeft || 0) + inset("left");
    let bottom = (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight) - inset("bottom");
    if (!details.closest("[aria-modal='true'], dialog[open]")) {
      const header = document.querySelector(".site-header");
      const headerRect = header?.getBoundingClientRect();
      if (headerRect?.top <= top && headerRect.bottom > top && ["fixed", "sticky"].includes(getComputedStyle(header).position)) top = headerRect.bottom + 8;
      document.querySelectorAll(".mobile-bottom-nav, .editor-top-actions").forEach((bar) => {
        const rect = bar.getBoundingClientRect();
        if (bar.getClientRects().length && getComputedStyle(bar).position === "fixed" && rect.bottom >= bottom && rect.top > top) {
          bottom = Math.min(bottom, rect.top - 8);
        }
      });
    }
    const right = (viewport?.offsetLeft || 0) + (viewport?.width || document.documentElement.clientWidth) - inset("right");
    const target = anchor.getBoundingClientRect();
    const below = Math.max(44, bottom - target.bottom - 8);
    const above = Math.max(44, target.top - top - 8);
    menu.style.width = `${Math.min(240, right - left)}px`;
    menu.style.maxHeight = `${Math.min(320, Math.max(below, above))}px`;
    const bounds = menu.getBoundingClientRect();
    const parent = menu.offsetParent;
    const origin = parent.getBoundingClientRect();
    const y = below >= bounds.height || below >= above ? target.bottom + 8 : target.top - bounds.height - 8;
    menu.style.left = `${Math.max(left, Math.min(target.right - bounds.width, right - bounds.width)) - origin.left + parent.scrollLeft - parent.clientLeft}px`;
    menu.style.top = `${Math.max(top, Math.min(y, bottom - bounds.height)) - origin.top + parent.scrollTop - parent.clientTop}px`;
    menu.style.right = "auto";
  };
  useEffect(() => {
    const closeOutside = (event) => {
      if (ref.current?.open && !ref.current.contains(event.target)) ref.current.open = false;
    };
    const reposition = (event) => {
      if (!(event.target instanceof Node) || !ref.current?.querySelector(":scope > div")?.contains(event.target)) positionMenu();
    };
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    window.visualViewport?.addEventListener("resize", reposition);
    window.visualViewport?.addEventListener("scroll", reposition);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      window.visualViewport?.removeEventListener("resize", reposition);
      window.visualViewport?.removeEventListener("scroll", reposition);
    };
  }, []);
  return <details ref={ref} className={className}
    onToggle={positionMenu}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }}
    onKeyDown={(event) => {
      if (event.key !== "Escape" || !event.currentTarget.open) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.open = false;
      event.currentTarget.querySelector("summary")?.focus({ preventScroll: true });
    }}>{children}</details>;
}
