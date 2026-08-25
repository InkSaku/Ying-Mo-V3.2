import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { isIosLike, pwaInstallMode } from "../src/lib/pwaInstall.js";

test("detects iPhone, iPad and touch-mode iPad user agents", () => {
  assert.equal(isIosLike({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" }), true);
  assert.equal(isIosLike({ platform: "MacIntel", maxTouchPoints: 5 }), true);
  assert.equal(isIosLike({ platform: "MacIntel", maxTouchPoints: 0 }), false);
  assert.equal(isIosLike({ userAgent: "Mozilla/5.0 (Linux; Android 15)" }), false);
});

test("prioritizes installed and secure prompt states", () => {
  assert.equal(pwaInstallMode({ installed: true, secure: false, serviceWorker: false }), "installed");
  assert.equal(pwaInstallMode({ secure: false, serviceWorker: true, canPrompt: true }), "insecure");
  assert.equal(pwaInstallMode({ secure: true, serviceWorker: false }), "unsupported");
  assert.equal(pwaInstallMode({ secure: true, serviceWorker: true, canPrompt: true }), "prompt");
  assert.equal(pwaInstallMode({ secure: true, serviceWorker: true, ios: true }), "ios");
  assert.equal(pwaInstallMode({ secure: true, serviceWorker: true }), "browser-menu");
});

test("PWA quick-note shortcut opens the homepage composer", () => {
  const config = readFileSync(new URL("../vite.config.js", import.meta.url), "utf8");
  assert.match(config, /url: "\/home\?compose=note&source=pwa-shortcut"/);
  assert.doesNotMatch(config, /url: "\/write\?type=note&source=pwa-shortcut"/);
});
