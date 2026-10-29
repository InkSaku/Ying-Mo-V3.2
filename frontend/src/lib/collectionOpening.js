import { fitRect, PAPER_EASE, paperMotionAllowed, visualLayer } from "./paperMotion";

let opening = null;
const DURATION = 810;
const HANDOFF = 660;

// Freeze only the book's rendered parts. No links, controls or media requests
// travel with the visual copy; scoped shelf styles survive the route unmount.
function copyBook(source) {
  const copy = source.cloneNode(true);
  const originals = [source, ...source.querySelectorAll("*")];
  const copies = [copy, ...copy.querySelectorAll("*")];
  originals.forEach((element, index) => {
    const style = getComputedStyle(element);
    for (const property of style) copies[index].style.setProperty(property, style.getPropertyValue(property));
    copies[index].style.transition = "none";
    copies[index].style.animation = "none";
    for (const attribute of ["id", "tabindex", "autofocus"]) copies[index].removeAttribute(attribute);
  });
  Object.assign(copy.style, { inset: "0", width: "100%", height: "100%", margin: "0" });
  for (const part of copy.querySelectorAll(".collection-shelf-back, .collection-shelf-hinge, .collection-card-cover-frame, .collection-shelf-lining, .card-cover, .collection-book-fallback")) {
    Object.assign(part.style, { width: "100%", height: "100%" });
  }
  Object.assign(copy.querySelector(".collection-shelf-pages").style, { width: "calc(100% - 4px)", height: "calc(100% - 7px)" });
  copy.querySelector(".collection-shelf-spine").style.height = "100%";
  return copy;
}

function bounds(rect) {
  return { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` };
}

// An opened cover extends left of the spine. Fit the whole spread, keeping its
// centre over the destination cover and clear of the real colophon on the right.
function spreadRect(rect, right = innerWidth - 16) {
  const width = Math.max(1, Math.min(rect.width, (right - 16) / 1.95, (innerHeight - 40) / 1.25));
  const height = width * 1.25;
  const left = Math.max(16 + width * .95, Math.min(right - width, rect.left + rect.width / 2 - width * .025));
  return { left, top: Math.max(16, Math.min(innerHeight - height - 16, rect.top + (rect.height - height) / 2 - 8)), width, height };
}

export function startCollectionOpening(event, slug) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.currentTarget.target === "_blank") return;
  opening?.finish();
  if (!paperMotionAllowed()) return;
  // Ordinary cards and shelf cards outside the directory retain native navigation.
  const card = event.currentTarget.closest(".collection-library-page .collection-card-shelf");
  const source = card?.querySelector(".collection-shelf-stage");
  const original = source?.querySelector(".collection-shelf-book");
  const rect = source?.getBoundingClientRect();
  if (!original || !rect?.width || !rect.height || rect.bottom < 0 || rect.top > innerHeight) return;

  const scene = visualLayer("book");
  const stage = document.createElement("div");
  stage.className = "paper-opening-stage";
  fitRect(stage, rect);
  stage.style.perspective = getComputedStyle(source).perspective;
  stage.style.perspectiveOrigin = "50% 45%";
  const book = copyBook(original);
  book.classList.add("paper-opening-book");
  const hinge = book.querySelector(".collection-shelf-hinge");
  const front = book.querySelector(".collection-card-cover-frame");
  front.classList.add("paper-opening-front");
  const pages = book.querySelector(".collection-shelf-pages");
  pages.classList.add("paper-opening-pages");
  const title = card.querySelector("h3")?.textContent || "";
  const titlepage = document.createElement("div");
  titlepage.className = "paper-opening-titlepage";
  const imprint = document.createElement("small");
  imprint.textContent = "映墨 · 合集";
  const name = document.createElement("strong");
  name.textContent = title;
  titlepage.append(imprint, name);
  pages.append(titlepage);
  const image = front.querySelector("img");
  if (front.querySelector(".protected-image-placeholder") || (image && !image.naturalWidth)) {
    front.replaceChildren(titlepage.cloneNode(true));
  }
  // Pixel transform origins from the snapshot must follow the changing 4:5 size.
  hinge.style.transformOrigin = "left center";
  book.style.transformOrigin = "center center";
  stage.append(book);
  scene.layer.append(stage);
  scene.hide(source);

  const started = performance.now();
  const destinationPath = `/collections/${encodeURIComponent(slug)}`;
  const allowedPaths = new Set([location.pathname, destinationPath]);
  let positioned = false;
  const observer = new MutationObserver(() => {
    if (!allowedPaths.has(location.pathname)) { finish(); return; }
    if (!positioned && location.pathname === destinationPath && !source.isConnected) {
      positioned = true;
      if (window.scrollY) window.scrollTo({ top: 0, behavior: "instant" });
    }
  });
  const finish = () => {
    observer.disconnect();
    if (opening?.scene === scene) opening = null;
    scene.finish();
  };
  observer.observe(document.body, { childList: true, subtree: true });
  const lifted = spreadRect(rect);
  // Before the target exists, only make room for the opening cover. Do not
  // drift sideways toward a guessed centre and then reverse on data arrival.
  lifted.left = Math.max(16 + lifted.width * .95, Math.min(innerWidth - 16 - lifted.width, rect.left));
  const motion = scene.animate(stage, [bounds(rect), bounds(lifted)], { duration: HANDOFF, easing: PAPER_EASE, fill: "both" });
  scene.animate(book, [
    { transform: book.style.transform },
    { transform: "translateY(-8px) rotateX(0deg) rotateY(0deg)" },
  ], { duration: 180, easing: PAPER_EASE, fill: "both" });
  scene.animate(hinge, [
    { transform: "translateZ(14px) rotateY(0deg)" },
    { transform: "translateZ(14px) rotateY(-70deg)", offset: .45 },
    { transform: "translateZ(14px) rotateY(-158deg)" },
  ], { delay: 140, duration: 520, easing: "cubic-bezier(.4,0,.2,1)", fill: "both" });
  const exit = scene.animate(scene.layer, [
    { opacity: 1 }, { opacity: 1, offset: HANDOFF / DURATION }, { opacity: 0 },
  ], { duration: DURATION, easing: "linear", fill: "both" });
  opening = { scene, slug, stage, motion, started, finish, revealed: false };
  void exit.finished.then(finish, finish);
}

export function revealCollection(slug, target) {
  const current = opening;
  if (!current || current.slug !== slug || !current.scene.active || current.revealed || !target) return;
  current.revealed = true;
  const elapsed = performance.now() - current.started;
  // The book always finishes on time; late data uses the normal loaded page.
  if (elapsed > 500) return;
  let rect = target.getBoundingClientRect();
  // A lower shelf can be clicked after scrolling. The source copy is fixed in
  // viewport space, so the new page can return to its colophon underneath it.
  if (rect.top < 0 || rect.top >= innerHeight) {
    window.scrollTo({ top: 0, behavior: "instant" });
    rect = target.getBoundingClientRect();
  }
  if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > innerHeight) { current.finish(); return; }
  const copy = target.closest(".collection-volume-hero")?.querySelector(".collection-volume-copy");
  const copyRect = copy?.getBoundingClientRect();
  const right = copyRect && copyRect.top < rect.bottom ? Math.min(innerWidth - 16, copyRect.left - 20) : innerWidth - 16;
  const from = current.stage.getBoundingClientRect();
  current.motion.cancel();
  fitRect(current.stage, from);
  current.scene.animate(current.stage, [bounds(from), bounds(spreadRect(rect, right))], {
    duration: Math.max(120, HANDOFF - elapsed), easing: "cubic-bezier(.22,.7,.2,1)", fill: "both",
  });
  current.scene.animate(target, [
    { opacity: 0 }, { opacity: 0, offset: Math.max(0, (HANDOFF - elapsed) / (DURATION - elapsed)) }, { opacity: 1 },
  ], { duration: DURATION - elapsed, easing: "linear", fill: "both" });
}

if (import.meta.hot) import.meta.hot.dispose(() => opening?.finish());
