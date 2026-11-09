import { fitRect, PAPER_EASE, paperMotionAllowed, visualLayer } from "./paperMotion";

let opening = null;
const DURATION = 1260;
const HANDOFF = 1080;
const TRAVEL = 280;
const OPEN_AT = 300;
const OPEN_TIME = 680;
const TURN_EASE = "cubic-bezier(.62,.02,.24,1)";
// 透视按书的宽度换算，手机上的小书也有同样的立体感。
const PERSPECTIVE_RATIO = 3.2;
const FULL_TURN = 180;
const ANGLES = [0, 30, 60, 90, 120, 150, 180];

// 光线从正面来：封面转走时变暗，内页从暗处转回，底页先接住封面的投影再散开。
function lightAt(angle) {
  const sine = Math.sin(angle * Math.PI / 180);
  return {
    front: angle <= 90 ? sine : 1,
    lining: angle <= 90 ? 1 : 1 - ((angle - 90) / 90) ** 1.4,
    pages: angle <= 90 ? sine ** .7 : ((FULL_TURN - angle) / 90) ** 1.3,
  };
}

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

function addShade(parent, kind) {
  const shade = document.createElement("span");
  shade.className = `paper-opening-shade is-${kind}`;
  parent.append(shade);
  return shade;
}

// 翻开后左页的内容：只取卡片上已经公开显示的文字，不额外请求数据。
function insidePage(card) {
  const page = document.createElement("div");
  page.className = "paper-opening-inside";
  const volume = document.createElement("small");
  volume.textContent = card.querySelector(".collection-card-volume")?.textContent.trim() || "";
  const colophon = document.createElement("div");
  const description = card.querySelector(".collection-card-content > p")?.textContent.trim();
  if (description) {
    const summary = document.createElement("p");
    summary.textContent = description;
    colophon.append(summary);
  }
  const signature = document.createElement("span");
  signature.textContent = [...(card.querySelector(".collection-book-meta")?.children || [])].map((item) => item.textContent.trim()).join(" ");
  colophon.append(signature);
  page.append(volume, colophon);
  return page;
}

function placement(rect, base) {
  return { transform: `translate(${rect.left - base.left}px, ${rect.top - base.top}px) scale(${rect.width / base.width}, ${rect.height / base.height})` };
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
  const centre = centredBookRect();
  // Keep the 3D scene's size and perspective stable throughout the turn.
  // Resizing its boards every frame forces mobile browsers to repaint them.
  fitRect(stage, centre);
  stage.style.transformOrigin = "0 0";
  stage.style.perspective = `${Math.round(centre.width * PERSPECTIVE_RATIO)}px`;
  stage.style.perspectiveOrigin = "50% 45%";
  const book = copyBook(original);
  book.classList.add("paper-opening-book");
  const hinge = book.querySelector(".collection-shelf-hinge");
  const front = book.querySelector(".collection-card-cover-frame");
  front.classList.add("paper-opening-front");
  // Give the two faces distinct planes so they cannot fight at the hinge.
  front.style.transform = "translateZ(0.5px)";
  const lining = book.querySelector(".collection-shelf-lining");
  lining.style.transform = "rotateY(180deg) translateZ(0.5px)";
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
  lining.append(insidePage(card));
  const shades = { front: addShade(front, "front"), lining: addShade(lining, "lining"), pages: addShade(pages, "pages") };
  // Pixel transform origins from the snapshot must follow the changing 4:5 size.
  hinge.style.transformOrigin = "left center";
  lining.style.transformOrigin = "center center";
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
  scene.animate(stage, [placement(rect, centre), placement(centre, centre)], { duration: TRAVEL, easing: PAPER_EASE, fill: "forwards" });
  scene.animate(book, [
    { transform: book.style.transform },
    { transform: "translateY(-6px) rotateX(0deg) rotateY(0deg)", offset: .65 },
    { transform: "rotateX(0deg) rotateY(0deg)" },
  ], { duration: TRAVEL, easing: PAPER_EASE, fill: "both" });
  const turnOptions = { delay: OPEN_AT, duration: OPEN_TIME, easing: TURN_EASE, fill: "forwards" };
  scene.animate(hinge, ANGLES.map((angle) => ({
    transform: `translateZ(14px) rotateY(${-angle}deg)`, offset: angle / FULL_TURN,
  })), turnOptions);
  // As the front board crosses the spine, compensate its newly visible left
  // half. Both tracks share timing, so the whole open spread stays centred.
  scene.animate(stage, ANGLES.map((angle) => ({
    ...placement(angle ? turnRect(centre, angle, Number.parseFloat(stage.style.perspective) || 1000) : centre, centre),
    offset: angle / FULL_TURN,
  })), turnOptions);
  // 光影和翻转共用同一条时间线，只动 opacity，手机上也不用重绘纸面。
  for (const [kind, shade] of Object.entries(shades)) {
    scene.animate(shade, ANGLES.map((angle) => ({ opacity: lightAt(angle)[kind], offset: angle / FULL_TURN })), turnOptions);
  }
  // 摊平时两页要齐平：书壳的深色边线和投影只留在合着的时候。
  scene.animate(book.querySelector(".collection-shelf-back"), ANGLES.map((angle) => ({
    opacity: Math.min(1, (FULL_TURN - angle) / 60), offset: angle / FULL_TURN,
  })), turnOptions);
  // Fading the common ancestor flattens its 3D descendants. Fade the boards
  // only after the turn, with a separate backdrop for the destination page.
  const exitOptions = { delay: HANDOFF, duration: DURATION - HANDOFF, easing: "linear", fill: "forwards" };
  scene.animate(backdrop, [{ opacity: 1 }, { opacity: 0 }], exitOptions);
  const exit = scene.animate(stage, [{ opacity: 1 }, { opacity: 0 }], exitOptions);
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
