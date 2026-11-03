/**
 * pwa.ts — service-worker registration and the update flow.
 *
 * The new worker installs in the background and waits; we then fire a
 * "pwa:update" window event — the UI shows a toast. When the user taps
 * «Обновить», applyPwaUpdate() posts SKIP_WAITING, the new worker activates
 * and the controllerchange handler reloads the page exactly once.
 *
 * Update checks are proactive, not just on cold start: registration uses
 * updateViaCache:"none" (the sw.js script itself is never served from the
 * HTTP cache), and reg.update() runs on launch, every 3 minutes while the
 * app is open, and every time the app returns to the foreground.
 */

let waitingWorker: ServiceWorker | null = null;
let swVersion: string | null = null;
let registration: ServiceWorkerRegistration | null = null;

/** Activate the waiting worker (called from the update toast). */
export function applyPwaUpdate(): void {
  waitingWorker?.postMessage("SKIP_WAITING");
}

/** Version string of the ACTIVE worker ("resurs-v18"), null until known. */
export function getSwVersion(): string | null {
  return swVersion;
}

/** Force an update check right now (Settings «Проверить обновления»). */
export function checkPwaUpdate(): void {
  registration?.update().catch(() => {
    /* offline — try again later */
  });
}

function setSwVersion(v: string): void {
  if (v === swVersion) return;
  swVersion = v;
  window.dispatchEvent(new CustomEvent("pwa:version", { detail: v }));
}

function askVersion(): void {
  navigator.serviceWorker.controller?.postMessage("GET_VERSION");
}

export function initPwa(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      // BASE_URL keeps the worker at the app root both locally ("/")
      // and under the GitHub Pages subpath ("/resurs/");
      // updateViaCache:"none" — the sw.js check never hits the HTTP cache,
      // so GitHub Pages' 10-minute cache can no longer delay updates
      .register(import.meta.env.BASE_URL + "sw.js", { updateViaCache: "none" })
      .then((reg) => {
        registration = reg;
        const announce = (w: ServiceWorker | null) => {
          if (!w) return;
          waitingWorker = w;
          window.dispatchEvent(new CustomEvent("pwa:update"));
        };
        // a worker already waiting from a previous visit
        if (reg.waiting && navigator.serviceWorker.controller) announce(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const w = reg.installing;
          if (!w) return;
          w.addEventListener("statechange", () => {
            // installed + there IS an active controller → this is an update, not first install
            if (w.state === "installed" && navigator.serviceWorker.controller) announce(w);
          });
        });
        // proactive checks: now, every 3 minutes, and on every foregrounding
        checkPwaUpdate();
        window.setInterval(checkPwaUpdate, 3 * 60 * 1000);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") checkPwaUpdate();
        });
        // ask the active worker which version it is (for Settings)
        askVersion();
        navigator.serviceWorker.addEventListener("message", (e) => {
          const d = e.data as { type?: string; version?: string } | null;
          if (d?.type === "sw:version" && typeof d.version === "string") setSwVersion(d.version);
        });
      })
      .catch(() => {
        /* offline mode unavailable — the app still works online */
      });

    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  });
}
