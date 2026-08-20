import assert from "node:assert/strict";
import test from "node:test";

import {
  READING_DWELL_MS,
  installVisibleReadTracker,
} from "../src/lib/readingStats.js";

function createFakeDocument(initialVisibility = "visible") {
  let listener = null;
  return {
    visibilityState: initialVisibility,
    addEventListener(name, callback) {
      if (name === "visibilitychange") listener = callback;
    },
    removeEventListener(name, callback) {
      if (name === "visibilitychange" && listener === callback) listener = null;
    },
    setVisibility(nextVisibility) {
      this.visibilityState = nextVisibility;
      listener?.();
    },
  };
}

test("counts a read only after five continuous visible seconds", async () => {
  const documentRef = createFakeDocument();
  const timers = new Map();
  const cleared = [];
  const reads = [];
  let nextTimerId = 1;

  const cleanup = installVisibleReadTracker({
    postId: 42,
    documentRef,
    setTimer(callback, delay) {
      const id = nextTimerId;
      nextTimerId += 1;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimer(timerId) {
      cleared.push(timerId);
      timers.delete(timerId);
    },
    onRead(postId) {
      reads.push(postId);
    },
  });

  const runTimer = (timerId) => {
    const timer = timers.get(timerId);
    assert.ok(timer);
    timers.delete(timerId);
    timer.callback();
  };

  assert.equal(timers.get(1).delay, READING_DWELL_MS);

  documentRef.setVisibility("hidden");
  assert.deepEqual(cleared, [1]);
  assert.equal(timers.size, 0);

  documentRef.setVisibility("visible");
  assert.equal(timers.get(2).delay, READING_DWELL_MS);
  runTimer(2);
  await Promise.resolve();
  assert.deepEqual(reads, [42]);

  documentRef.setVisibility("hidden");
  documentRef.setVisibility("visible");
  assert.equal(timers.size, 0);
  assert.equal(reads.length, 1);

  cleanup();
});

test("cleanup cancels a pending read attempt", () => {
  const documentRef = createFakeDocument();
  const cleared = [];
  const reads = [];

  const cleanup = installVisibleReadTracker({
    postId: 7,
    documentRef,
    setTimer() {
      return 99;
    },
    clearTimer(timerId) {
      cleared.push(timerId);
    },
    onRead(postId) {
      reads.push(postId);
    },
  });

  cleanup();
  assert.deepEqual(cleared, [99]);
  assert.deepEqual(reads, []);
});
