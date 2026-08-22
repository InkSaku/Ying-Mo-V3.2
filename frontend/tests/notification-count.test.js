import test from "node:test";
import assert from "node:assert/strict";

import {
  newNotificationDelta,
  normalizeUnreadCount,
  unreadBadgeText,
} from "../src/lib/notificationCount.js";

test("normalizes unread counts and caps the visible badge", () => {
  assert.equal(normalizeUnreadCount(-1), 0);
  assert.equal(normalizeUnreadCount("7"), 7);
  assert.equal(unreadBadgeText(0), "");
  assert.equal(unreadBadgeText(12), "12");
  assert.equal(unreadBadgeText(120), "99+");
});

test("only announces increases after the initial unread snapshot", () => {
  assert.equal(newNotificationDelta(0, 5, false), 0);
  assert.equal(newNotificationDelta(5, 7, true), 2);
  assert.equal(newNotificationDelta(7, 3, true), 0);
});
