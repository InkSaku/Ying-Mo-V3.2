import test from "node:test";
import assert from "node:assert/strict";
import { inkRevealKeyframes } from "../src/lib/themeInkGeometry.js";

function points(frame) {
  return frame.clipPath.slice(8, -1).split(",").map((pair) => pair.split(" ").map(parseFloat));
}

function contains(polygon, [x, y]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

test("ink grows from its control, never retreats, and covers every viewport corner", () => {
  for (const [width, height] of [[1440, 900], [390, 844], [320, 900], [768, 1024]]) {
    for (const origin of [{ x: 0, y: 0 }, { x: width - 30, y: 40 }, { x: width / 2, y: height / 2 }]) {
      const frames = inkRevealKeyframes(width, height, origin);
      const start = points(frames[0]);
      assert.ok(start.every(([x, y]) => x === origin.x && y === origin.y));
      let previous = start.map(() => 0);
      for (const frame of frames) {
        const distances = points(frame).map(([x, y]) => Math.hypot(x - origin.x, y - origin.y));
        assert.ok(distances.every((distance, index) => distance + .02 >= previous[index]));
        previous = distances;
      }
      const end = points(frames.at(-1));
      for (const corner of [[0, 0], [width, 0], [0, height], [width, height]]) assert.ok(contains(end, corner));
      assert.ok(Math.max(...previous) / Math.min(...previous) > 1.15, "the edge is irregular, not a circle");
    }
  }
});

test("invalid viewports are skipped and offscreen or missing origins remain finite", () => {
  assert.deepEqual(inkRevealKeyframes(0, 900), []);
  assert.deepEqual(inkRevealKeyframes(Infinity, 900), []);
  for (const origin of [undefined, { x: -20, y: 10000 }, { x: NaN, y: NaN }]) {
    const frames = inkRevealKeyframes(390, 844, origin);
    assert.ok(frames.every((frame) => points(frame).flat().every(Number.isFinite)));
  }
});
