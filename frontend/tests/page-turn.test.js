import test from "node:test";
import assert from "node:assert/strict";
import { pageTurnFrame } from "../src/lib/pageTurnGeometry.js";

function area(polygon) {
  return Math.abs(polygon.reduce((sum, [x, y], index) => {
    const [nextX, nextY] = polygon[(index + 1) % polygon.length];
    return sum + x * nextY - nextX * y;
  }, 0)) / 2;
}

test("the login sheet begins intact, lifts from bottom-right and leaves completely", () => {
  const first = pageTurnFrame(1440, 900, 0);
  assert.equal(area(first.front), 1440 * 900);
  assert.equal(area(first.back), 0);
  const lift = pageTurnFrame(1440, 900, .1);
  assert.equal(lift.front.some(([x, y]) => x === 1440 && y === 900), false);
  assert.equal(lift.front.some(([x, y]) => x === 0 && y === 0), true);
  const final = pageTurnFrame(1440, 900, 1);
  assert.equal(area(final.front), 0);
  assert.equal(final.back.every(([x, y]) => x <= 0 && y <= 0), true);
});

test("the reflected paper conserves area and has a continuous shared crease on wide and narrow screens", () => {
  for (const [width, height] of [[1440, 900], [768, 900], [390, 844], [320, 900], [2560, 720]]) {
    let previous = width * height;
    for (let step = 1; step < 100; step += 1) {
      const progress = step / 100;
      const { front, back, crease } = pageTurnFrame(width, height, progress);
      assert.ok(Math.abs(area(front) + area(back) - width * height) < .001);
      assert.ok(area(front) <= previous + .001);
      previous = area(front);
      assert.equal(crease.length, 2);
      const fold = (width + height) * (1 - progress);
      for (const [x, y] of crease) assert.ok(Math.abs(x + y - fold) < .001);
      assert.ok(front.every(([x, y]) => x >= -.001 && y >= -.001 && x <= width + .001 && y <= height + .001));
    }
  }
});

test("invalid dimensions and overshooting animation progress remain safe", () => {
  assert.deepEqual(pageTurnFrame(0, 900, .5), { front: [], back: [], crease: [] });
  assert.deepEqual(pageTurnFrame(Infinity, 900, .5), { front: [], back: [], crease: [] });
  assert.deepEqual(pageTurnFrame(390, 844, -1), pageTurnFrame(390, 844, 0));
  assert.deepEqual(pageTurnFrame(390, 844, 2), pageTurnFrame(390, 844, 1));
  assert.deepEqual(pageTurnFrame(390, 844, NaN), pageTurnFrame(390, 844, 0));
});
