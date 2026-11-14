/**
 * "Add to home screen" support. Android/desktop Chrome fire `beforeinstallprompt`
 * (we keep it so a button can trigger the install). iPhone Safari has no prompt:
 * people use Share → Add to Home Screen, so we show those steps instead.
 */
type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: PromptEvent | null = null;
const listeners = new Set<() => void>();

export function initInstallCapture(): void {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as PromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => { deferred = null; listeners.forEach((l) => l()); });
}

export function onInstallChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const canPromptInstall = () => deferred !== null;

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  return outcome === "accepted";
}

export function isInstalled(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true;
}

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => { /* app still works without it */ });
  });
}
