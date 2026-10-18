import { fitRect, PAPER_EASE, paperMotionAllowed, visualLayer } from "./paperMotion";

let activePhoto = null;
export function cancelPhotoContinuity() { activePhoto?.finish(); activePhoto = null; }

export function photoThumbnail(id, opener) {
  const candidates = [...document.querySelectorAll(".media-lightbox-trigger[data-media-id]")]
    .filter((node) => node.dataset.mediaId === String(id));
  if (opener?.dataset.mediaId === String(id) && opener.isConnected) candidates.unshift(opener);
  return candidates.map((node) => node.querySelector("img")).find((image) => {
    const rect = image?.getBoundingClientRect();
    return image?.complete && image.naturalWidth && rect.width > 0 && rect.height > 0
      && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
  });
}

// A uniform scale with an animated crop keeps every photo's original proportions.
export function animatePhoto(image, thumbnail, returning = false) {
  cancelPhotoContinuity();
  if (!paperMotionAllowed() || !image?.complete || !image.naturalWidth || !thumbnail) return;
  const large = image.getBoundingClientRect();
  const small = thumbnail.getBoundingClientRect();
  if (!large.width || !large.height || !small.width || !small.height) return;
  const scene = visualLayer(returning ? "photo-return" : "photo-lift");
  activePhoto = scene;
  const copy = document.createElement("img");
  copy.src = image.currentSrc || image.src;
  copy.alt = "";
  copy.className = "paper-moving-photo";
  fitRect(copy, large);
  scene.layer.append(copy);
  const scale = Math.max(small.width / large.width, small.height / large.height);
  const cropX = Math.max(0, (large.width - small.width / scale) / 2);
  const cropY = Math.max(0, (large.height - small.height / scale) / 2);
  const dx = small.left + small.width / 2 - (large.left + large.width / 2);
  const dy = small.top + small.height / 2 - (large.top + large.height / 2);
  const folded = { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, clipPath: `inset(${cropY}px ${cropX}px)` };
  const unfolded = { transform: "translate(0, 0) scale(1)", clipPath: "inset(0px 0px)" };
  scene.hide(image);
  scene.hide(thumbnail);
  const animation = scene.animate(copy, returning ? [unfolded, folded] : [folded, unfolded], {
    duration: returning ? 260 : 380, easing: PAPER_EASE, fill: "both",
  });
  void animation.finished.then(scene.finish, scene.finish);
}
