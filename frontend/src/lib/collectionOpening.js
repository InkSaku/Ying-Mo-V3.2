import { fitRect, PAPER_EASE, paperMotionAllowed, visualLayer } from "./paperMotion";

let opening = null;

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
  const image = source.matches("img") ? source : source.querySelector("img");
  if (image?.complete && image.naturalWidth) {
    const copy = image.cloneNode();
    copy.removeAttribute("class");
    copy.alt = "";
    leaf.append(copy);
  } else {
    const title = document.createElement("strong");
    title.textContent = card.querySelector("h3")?.textContent || "";
    leaf.append(title);
  }
  book.append(leaf);
  scene.layer.append(book);
  const lift = scene.animate(book, [
    { transform: "perspective(1200px) rotateY(0) rotateZ(0)" },
    { transform: "perspective(1200px) rotateY(-5deg) rotateZ(-1deg) translateY(-5px)" },
  ], { duration: 180, easing: PAPER_EASE, fill: "forwards" });
  opening = Object.assign(scene, { slug, book, leaf, rect, lift });
}

export function revealCollection(slug, target) {
  const scene = opening;
  if (!scene || scene.slug !== slug || !scene.active || !target) return;
  opening = null;
  const rect = target.getBoundingClientRect();
  if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > innerHeight) { scene.finish(); return; }
  scene.lift.cancel();
  fitRect(scene.book, rect);
  const dx = scene.rect.left - rect.left;
  const dy = scene.rect.top - rect.top;
  scene.animate(scene.book, [
    { transform: `translate(${dx}px, ${dy}px) scale(${scene.rect.width / rect.width}, ${scene.rect.height / rect.height}) rotate(-1deg)` },
    { transform: "translate(0, 0) scale(1) rotate(0)", offset: .5 },
    { transform: "translate(0, 0) scale(1) rotate(0)" },
  ], { duration: 580, easing: PAPER_EASE, fill: "both" });
  const turn = scene.animate(scene.leaf, [
    { transform: "perspective(1100px) rotateY(0deg)", opacity: 1 },
    { transform: "perspective(1100px) rotateY(-12deg)", opacity: 1, offset: .36 },
    { transform: "perspective(1100px) rotateY(-108deg)", opacity: 0 },
  ], { duration: 580, easing: PAPER_EASE, fill: "both" });
  void turn.finished.then(scene.finish, scene.finish);
}

if (import.meta.hot) import.meta.hot.dispose(() => opening?.finish());
