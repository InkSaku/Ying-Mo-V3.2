import { fitRect, PAPER_EASE, paperMotionAllowed, visualLayer } from "./paperMotion";

let opening = null;

// Keep the real crop, typography and fallback art instead of inventing a second cover.
function coverCopy(source) {
  const copy = source.cloneNode(true);
  const originals = [source, ...source.querySelectorAll("*")];
  const copies = [copy, ...copy.querySelectorAll("*")];
  originals.forEach((element, index) => {
    const style = getComputedStyle(element);
    for (const property of style) copies[index].style.setProperty(property, style.getPropertyValue(property));
    copies[index].removeAttribute("id");
  });
  Object.assign(copy.style, {
    position: "absolute", inset: "0", width: "100%", height: "100%", margin: "0",
    visibility: "visible", transform: "none", boxShadow: "none",
  });
  for (const image of copy.querySelectorAll("img, .collection-book-fallback, .collection-volume-fallback")) {
    Object.assign(image.style, { width: "100%", height: "100%" });
  }
  return copy;
}

export function startCollectionOpening(event, slug) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  opening?.finish();
  opening = null;
  if (!paperMotionAllowed()) return;
  const card = event.currentTarget.closest(".collection-card");
  const source = card?.querySelector(".collection-card-cover-frame, .card-cover");
  const rect = source?.getBoundingClientRect();
  if (!rect?.width || !rect.height || rect.bottom < 0 || rect.top > innerHeight) return;
  const scene = visualLayer("book");
  const book = document.createElement("div");
  book.className = "paper-opening-book";
  fitRect(book, rect);
  const leaf = document.createElement("div");
  leaf.className = "paper-opening-cover";
  leaf.append(coverCopy(source));
  book.append(leaf);
  scene.layer.append(book);
  scene.hide(source);
  const lift = scene.animate(book, [
    { transform: "translateY(0)" },
    { transform: "translateY(-5px)" },
  ], { duration: 180, easing: PAPER_EASE, fill: "forwards" });
  opening = Object.assign(scene, { slug, book, leaf, lift });
}

export function revealCollection(slug, target) {
  const scene = opening;
  if (!scene || scene.slug !== slug || !scene.active || !target) return;
  opening = null;
  const rect = target.getBoundingClientRect();
  if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > innerHeight) { scene.finish(); return; }
  const current = scene.book.getBoundingClientRect();
  const destination = coverCopy(target);
  destination.classList.add("paper-opening-destination");
  scene.leaf.append(destination);
  scene.hide(target);
  scene.lift.cancel();
  fitRect(scene.book, current);
  // Interpolate this isolated surface's bounds so landscape covers recrop rather
  // than stretching into the portrait detail frame. Continue from the live lift.
  scene.animate(scene.book, [
    { left: `${current.left}px`, top: `${current.top}px`, width: `${current.width}px`, height: `${current.height}px` },
    { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` },
  ], { duration: 580, easing: "cubic-bezier(.22,.7,.2,1)", fill: "both" });
  const turn = scene.animate(scene.leaf, [
    { transform: "rotateY(0deg)", boxShadow: "0 2px 6px rgb(0 0 0 / .06)" },
    { transform: "rotateY(-18deg)", boxShadow: "6px 8px 18px rgb(0 0 0 / .1)", offset: .32 },
    { transform: "rotateY(0deg)", boxShadow: "0 0 0 rgb(0 0 0 / 0)" },
  ], { duration: 580, easing: "ease-in-out", fill: "both" });
  scene.animate(destination, [
    { opacity: 0 }, { opacity: 0, offset: .55 }, { opacity: 1, offset: .9 }, { opacity: 1 },
  ], { duration: 580, easing: "linear", fill: "both" });
  void turn.finished.then(scene.finish, scene.finish);
}

if (import.meta.hot) import.meta.hot.dispose(() => opening?.finish());
