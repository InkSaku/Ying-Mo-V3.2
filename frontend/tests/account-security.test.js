import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  accountActionMessage,
  emailVerificationConfirmPayload,
  emailVerificationState,
  needsEmailVerification,
  normalizedEmail,
  passwordResetConfirmPayload,
  passwordResetFieldErrors,
  passwordResetRequestPayload,
  securityTokenSnapshot,
  clearSecurityTokenFragment,
} from "../src/lib/accountSecurity.js";
import {
  AUTH_INVALIDATION_STORAGE_KEY,
  authInvalidationReason,
  publishAuthInvalidation,
  shouldPublishAuthInvalidation,
} from "../src/lib/authInvalidation.js";

test("builds trimmed public account-security payloads", () => {
  assert.equal(normalizedEmail("  friend@example.com  "), "friend@example.com");
  assert.deepEqual(passwordResetRequestPayload(" friend@example.com "), {
    email: "friend@example.com",
  });
  assert.deepEqual(passwordResetConfirmPayload(" token-42 ", "new-password"), {
    token: "token-42",
    password: "new-password",
  });
  assert.deepEqual(emailVerificationConfirmPayload(" verify-42 "), {
    token: "verify-42",
  });
});

test("validates password length and exact confirmation", () => {
  assert.deepEqual(passwordResetFieldErrors({ password: "", confirmPassword: "" }), {
    password: "请输入新密码。",
    confirmPassword: "请再次输入新密码。",
  });
  assert.equal(Boolean(passwordResetFieldErrors({ password: "short", confirmPassword: "short" }).password), true);
  assert.equal(
    passwordResetFieldErrors({ password: "valid-password", confirmPassword: "different-password" }).confirmPassword,
    "两次输入的密码不一致。",
  );
  assert.deepEqual(passwordResetFieldErrors({ password: "valid-password", confirmPassword: "valid-password" }), {});
});

test("derives verification guidance only from self account fields", () => {
  assert.equal(emailVerificationState(null), "unknown");
  assert.equal(emailVerificationState({ email: "friend@example.com", email_verified: false }), "pending");
  assert.equal(emailVerificationState({ email: "friend@example.com", email_verified: true }), "verified");
  assert.equal(needsEmailVerification({ email: "friend@example.com", email_verified: false }), true);
  assert.equal(needsEmailVerification({ email: "friend@example.com", email_verified: true }), false);
});

test("uses a server success message when present and a safe fallback otherwise", () => {
  assert.equal(accountActionMessage({ message: "  已发送  " }, "fallback"), "已发送");
  assert.equal(accountActionMessage({}, "fallback"), "fallback");
});

test("reads security tokens only from the fragment and derives a fragment-free URL", () => {
  assert.deepEqual(
    securityTokenSnapshot({
      pathname: "/reset-password",
      search: "?source=email",
      hash: "#token=secret%20token&ignored=1",
    }),
    {
      token: "secret token",
      cleanUrl: "/reset-password?source=email",
      shouldReplace: true,
    },
  );
  assert.deepEqual(
    securityTokenSnapshot({
      pathname: "/reset-password",
      search: "?source=mail&token=query-secret&campaign=welcome",
    }),
    {
      token: "",
      cleanUrl: "/reset-password?source=mail&campaign=welcome",
      shouldReplace: true,
    },
  );
});

test("consumes the fragment by replacing browser history immediately", () => {
  const calls = [];
  const history = {
    state: { preserved: true },
    replaceState(...args) {
      calls.push(args);
    },
  };
  const cleanUrl = clearSecurityTokenFragment(
    { pathname: "/verify-email", search: "", hash: "#token=verify-42" },
    history,
  );
  assert.equal(cleanUrl, "/verify-email");
  assert.deepEqual(calls, [[{ preserved: true }, "", "/verify-email"]]);

  clearSecurityTokenFragment(
    { pathname: "/reset-password", search: "?token=query-secret", hash: "" },
    history,
  );
  assert.deepEqual(calls[1], [{ preserved: true }, "", "/reset-password"]);
});

test("broadcasts only a token-free cross-tab session invalidation event", () => {
  const writes = [];
  const storage = {
    setItem(key, value) {
      writes.push(["set", key, value]);
    },
    removeItem(key) {
      writes.push(["remove", key]);
    },
  };
  assert.equal(publishAuthInvalidation("PASSWORD_RESET", storage), true);
  assert.equal(writes[0][1], AUTH_INVALIDATION_STORAGE_KEY);
  const payload = JSON.parse(writes[0][2]);
  assert.deepEqual(
    { version: payload.version, reason: payload.reason, hasTimestamp: Number.isInteger(payload.occurred_at) },
    { version: 1, reason: "PASSWORD_RESET", hasTimestamp: true },
  );
  assert.deepEqual(writes[1], ["remove", AUTH_INVALIDATION_STORAGE_KEY]);
  assert.equal(writes[0][2].includes("token"), false);
  assert.equal(
    authInvalidationReason({ key: AUTH_INVALIDATION_STORAGE_KEY, newValue: writes[0][2] }),
    "PASSWORD_RESET",
  );
  assert.equal(authInvalidationReason({ key: "unrelated", newValue: writes[0][2] }), "");
  assert.equal(authInvalidationReason({ key: AUTH_INVALIDATION_STORAGE_KEY, newValue: "{" }), "");
  assert.equal(shouldPublishAuthInvalidation("LOGOUT"), true);
  assert.equal(shouldPublishAuthInvalidation("PASSWORD_RESET"), true);
  assert.equal(shouldPublishAuthInvalidation("REFRESH_FAILED"), false);
  assert.equal(shouldPublishAuthInvalidation("BOOTSTRAP_ANONYMOUS"), false);
});

test("keeps account recovery routes public, exact, and referrer-free", () => {
  const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const indexSource = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  for (const path of ["/forgot-password", "/verify-email", "/reset-password"]) {
    assert.equal(appSource.includes(`<Route path="${path}"`), true);
    assert.equal(appSource.includes(`<Route path="${path}/:`), false);
  }
  assert.equal(indexSource.includes('<meta name="referrer" content="no-referrer"'), true);
});
