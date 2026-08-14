import test from "node:test";
import assert from "node:assert/strict";

import { markNotificationReadForNavigation } from "../src/lib/notifications.js";

test("marks a notification read when its target opens", async () => {
  const calls = [];
  let changed = 0;
  const apiClient = {
    post: async (...args) => {
      calls.push(args);
    },
  };

  const result = await markNotificationReadForNavigation(apiClient, 42, () => {
    changed += 1;
  });

  assert.equal(result, true);
  assert.deepEqual(calls, [["/notifications/42/read", {}]]);
  assert.equal(changed, 1);
});

test("contains mark-read failures so target navigation is not rejected", async () => {
  let changed = 0;
  const apiClient = {
    post: async () => {
      throw new Error("network unavailable");
    },
  };

  const result = await markNotificationReadForNavigation(apiClient, 9, () => {
    changed += 1;
  });

  assert.equal(result, false);
  assert.equal(changed, 0);
});
