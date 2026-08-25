let initialized = false;
let deferredPrompt = null;
let snapshot = {
  installed: false,
  canPrompt: false,
  ios: false,
  secure: true,
  serviceWorker: false,
};
const listeners = new Set();

export function isIosLike({ userAgent = "", platform = "", maxTouchPoints = 0 } = {}) {
  return /iPad|iPhone|iPod/i.test(userAgent)
    || (platform === "MacIntel" && Number(maxTouchPoints) > 1);
}

export function pwaInstallMode({
  installed = false,
  canPrompt = false,
  ios = false,
  secure = true,
  serviceWorker = true,
} = {}) {
  if (installed) return "installed";
  if (!secure) return "insecure";
  if (!serviceWorker) return "unsupported";
  if (canPrompt) return "prompt";
  if (ios) return "ios";
  return "browser-menu";
}

function emit() {
  const next = getPwaInstallSnapshot();
  listeners.forEach((listener) => listener(next));
}

function readEnvironment() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return snapshot;
  const displayStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches === true;
  return {
    ...snapshot,
    installed: displayStandalone || navigator.standalone === true,
    ios: isIosLike(navigator),
    secure: window.isSecureContext !== false,
    serviceWorker: "serviceWorker" in navigator,
  };
}

export function initializePwaInstall() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  snapshot = readEnvironment();

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    snapshot = { ...readEnvironment(), canPrompt: true };
    emit();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    snapshot = { ...readEnvironment(), installed: true, canPrompt: false };
    emit();
  });

  const displayMode = window.matchMedia?.("(display-mode: standalone)");
  displayMode?.addEventListener?.("change", () => {
    snapshot = { ...readEnvironment(), canPrompt: Boolean(deferredPrompt) };
    emit();
  });
}

export function getPwaInstallSnapshot() {
  return {
    ...snapshot,
    mode: pwaInstallMode(snapshot),
  };
}

export function subscribePwaInstall(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function requestPwaInstall() {
  if (!deferredPrompt) return { outcome: "unavailable" };
  const prompt = deferredPrompt;
  deferredPrompt = null;
  snapshot = { ...snapshot, canPrompt: false };
  emit();
  await prompt.prompt();
  const choice = await prompt.userChoice;
  return { outcome: choice?.outcome === "accepted" ? "accepted" : "dismissed" };
}
