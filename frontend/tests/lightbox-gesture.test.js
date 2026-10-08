import assert from "node:assert/strict";
import test from "node:test";
import { clampPan, clampScale, edgeResistance, shouldCommitGesture, zoomAround } from "../src/lib/lightboxGesture.js";

test("pinch zoom keeps the touched image point under the fingers", () => {
  const next = zoomAround({ scale: 1.5, x: 20, y: -10 }, 3, { x: 80, y: 40 }, { x: 100, y: 30 });
  assert.deepEqual(next, { scale: 3, x: -20, y: -70 });
  assert.equal(clampScale(8), 4);
  assert.equal(clampPan(140, 400, 500, 2), 140);
  assert.equal(clampPan(180, 400, 500, 2), 150);
  assert.equal(clampPan(-50, 400, 500, 1), 0);
});

test("short drags settle back and unavailable edges resist movement", () => {
  assert.equal(shouldCommitGesture(20, 0.2, 390), false);
  assert.equal(shouldCommitGesture(82, 0.1, 390), true);
  assert.equal(shouldCommitGesture(35, 0.8, 390), true);
  assert.ok(edgeResistance(200) < 200);
  assert.ok(edgeResistance(-200) > -200);
});
