import { fitRect, PAPER_EASE, paperMotionAllowed, visualLayer } from "./paperMotion";

let opening = null;
const DURATION = 1200;
const HANDOFF = 1020;
const TRAVEL = 280;
const OPEN_AT = 300;
const OPEN_TIME = 620;

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

// Reserve space for both boards, including the near edge under perspective.
function centredBookRect() {
  const width = Math.max(1, Math.min(320, (innerWidth - 48) / 2.1, (innerHeight - 96) / 1.25));
  const height = width * 1.25;
  return { left: (innerWidth - width) / 2, top: (innerHeight - height) / 2, width, height };
}

function turnRect(centre, angle, perspective) {
  const radians = angle * Math.PI / 180;
  const depth = 14 + centre.width * Math.sin(radians);
  const projectX = (x, z) => centre.width / 2 + (x - centre.width / 2) / (1 - z / perspective);
  const edges = [projectX(0, 14), projectX(centre.width * Math.cos(radians), depth), projectX(centre.width - 2, 12)];
  // Account for perspective as well as rotation; otherwise the near board
  // pulls the apparent centre sideways while it crosses ninety degrees.
  return {
    ...centre,
    left: innerWidth / 2 - (Math.min(...edges) + Math.max(...edges)) / 2,
    top: innerHeight / 2 - centre.height * (.45 + .05 / (1 - Math.max(14, depth) / perspective)),
  };
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
  const backdrop = document.createElement("div");
  backdrop.className = "paper-opening-backdrop";
  scene.layer.append(backdrop);
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
  book.querySelector(".collection-shelf-lining").style.transformOrigin = "center center";
  book.style.transformOrigin = "center center";
  stage.append(book);
  scene.layer.append(stage);
  scene.hide(source);

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
  const centre = centredBookRect();
  scene.animate(stage, [bounds(rect), bounds(centre)], { duration: TRAVEL, easing: PAPER_EASE, fill: "forwards" });
  scene.animate(book, [
    { transform: book.style.transform },
    { transform: "translateY(-6px) rotateX(0deg) rotateY(0deg)", offset: .65 },
    { transform: "rotateX(0deg) rotateY(0deg)" },
  ], { duration: TRAVEL, easing: PAPER_EASE, fill: "both" });
  const angles = [0, 35, 70, 90, 115, 140, 158];
  const turnOptions = { delay: OPEN_AT, duration: OPEN_TIME, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" };
  scene.animate(hinge, angles.map((angle) => ({
    transform: `translateZ(14px) rotateY(${-angle}deg)`, offset: angle / 158,
  })), turnOptions);
  // As the front board crosses the spine, compensate its newly visible left
  // half. Both tracks share timing, so the whole open spread stays centred.
  scene.animate(stage, angles.map((angle) => ({
    ...bounds(angle ? turnRect(centre, angle, Number.parseFloat(stage.style.perspective) || 1000) : centre),
    offset: angle / 158,
  })), turnOptions);
  const exit = scene.animate(scene.layer, [
    { opacity: 1 }, { opacity: 1, offset: HANDOFF / DURATION }, { opacity: 0 },
  ], { duration: DURATION, easing: "linear", fill: "both" });
  opening = { scene, slug, finish, revealed: false };
  void exit.finished.then(finish, finish);
}

export function revealCollection(slug, target) {
  const current = opening;
  if (!current || current.slug !== slug || !current.scene.active || current.revealed || !target) return;
  current.revealed = true;
  // Data loads under the paper backdrop; readiness never changes the book's
  // position or interrupts its turn. Late data keeps the existing page loader.
  if (window.scrollY) window.scrollTo({ top: 0, behavior: "instant" });
}

if (import.meta.hot) import.meta.hot.dispose(() => opening?.finish());
