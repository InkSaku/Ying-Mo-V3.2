const TAU = Math.PI * 2;
const POINTS = 768;

// Fixed, nested contours: broad pools, smaller uneven edges, then tiny fibres.
// A point only travels outward, so ink never uncovers the old theme again.
export function inkRevealKeyframes(width, height, origin) {
  if (!(width > 0 && height > 0 && Number.isFinite(width + height))) return [];
  const clamp = (value, max) => Math.max(0, Math.min(max, value));
  const x = clamp(Number.isFinite(origin?.x) ? origin.x : width / 2, width);
  const y = clamp(Number.isFinite(origin?.y) ? origin.y : height / 2, height);
  const contour = Array.from({ length: POINTS }, (_, index) => {
    const angle = index / POINTS * TAU;
    const radius = .88 + .09 * Math.sin(3 * angle + .7) + .065 * Math.sin(5 * angle - 1.2)
      + .035 * Math.sin(11 * angle + 2.1) + .018 * Math.sin(23 * angle - .8)
      + .009 * Math.sin(47 * angle + 1.3) + .005 * Math.sin(79 * angle);
    return [Math.cos(angle) * radius, Math.sin(angle) * radius, radius];
  });
  const reach = (Math.hypot(Math.max(x, width - x), Math.max(y, height - y)) + 4)
    / Math.min(...contour.map((point) => point[2])) / Math.cos(TAU / POINTS);
  return Array.from({ length: 33 }, (_, index) => {
    const offset = index / 32;
    const radius = reach * (1 - Math.pow(1 - offset, 1.8));
    return {
      offset,
      clipPath: `polygon(${contour.map(([dx, dy]) => `${(x + dx * radius).toFixed(2)}px ${(y + dy * radius).toFixed(2)}px`).join(",")})`,
    };
  });
}
