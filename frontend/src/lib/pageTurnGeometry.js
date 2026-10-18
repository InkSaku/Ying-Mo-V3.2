function clipAtFold(polygon, fold, keepFront) {
  const inside = ([x, y]) => keepFront ? x + y <= fold : x + y >= fold;
  const result = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const previous = polygon[(index + polygon.length - 1) % polygon.length];
    if (inside(current) !== inside(previous)) {
      const amount = (fold - previous[0] - previous[1])
        / (current[0] + current[1] - previous[0] - previous[1]);
      result.push([
        previous[0] + (current[0] - previous[0]) * amount,
        previous[1] + (current[1] - previous[1]) * amount,
      ]);
    }
    if (inside(current)) result.push(current);
  }
  return result;
}

// Reflect the lifted bottom-right portion across x + y = fold. The front
// stays perfectly still; the paper's reverse moves over it towards top-left.
export function pageTurnFrame(width, height, progress) {
  if (!(Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0)) return { front: [], back: [], crease: [] };
  const amount = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const fold = (width + height) * (1 - amount);
  const rectangle = [[0, 0], [width, 0], [width, height], [0, height]];
  const front = clipAtFold(rectangle, fold, true);
  const lifted = clipAtFold(rectangle, fold, false);
  const back = lifted.map(([x, y]) => [fold - y, fold - x]);
  const intersections = [[fold, 0], [width, fold - width], [fold - height, height], [0, fold]]
    .filter(([x, y]) => x >= 0 && x <= width && y >= 0 && y <= height)
    .filter(([x, y], index, points) => points.findIndex(([a, b]) => a === x && b === y) === index);
  return { front, back, crease: intersections.slice(0, 2) };
}
