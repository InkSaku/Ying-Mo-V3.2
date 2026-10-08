export const LIGHTBOX_MAX_SCALE = 4;

export function clampScale(scale) {
  return Math.min(LIGHTBOX_MAX_SCALE, Math.max(1, scale));
}

export function clampPan(pan, imageSize, viewportSize, scale) {
  const limit = Math.max(0, (imageSize * scale - viewportSize) / 2);
  if (limit === 0) return 0;
  return Math.min(limit, Math.max(-limit, pan));
}

export function zoomAround({ scale, x, y }, nextScale, origin, target = origin) {
  const boundedScale = clampScale(nextScale);
  const ratio = boundedScale / scale;
  return {
    scale: boundedScale,
    x: target.x - (origin.x - x) * ratio,
    y: target.y - (origin.y - y) * ratio,
  };
}

export function shouldCommitGesture(distance, velocity, size) {
  return Math.abs(distance) > Math.min(104, size * 0.2)
    || (Math.abs(distance) > 28 && Math.abs(velocity) > 0.65);
}

export function edgeResistance(distance) {
  return distance / (1 + Math.abs(distance) / 180);
}
