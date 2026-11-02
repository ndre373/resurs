/**
 * pwa.ts — service-worker registration and the update flow.
 *
 * The new worker installs in the background and waits; we then fire a
 * "pwa:update" window event — the UI shows a toast. When the user taps
 * «Обновить», applyPwaUpdate() posts SKIP_WAITING, the new worker activates
 * and the controllerchange handler reloads the page exactly once.
 */

let waitingWorker: ServiceWorker | null = null;

/** Activate the waiting worker (called from the update toast). */
export function applyPwaUpdate(): void {
  waitingWorker?.postMessage("SKIP_WAITING");
}

export function initPwa(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      // BASE_URL keeps the worker at the app root both locally ("/")
      // and under the GitHub Pages subpath ("/resurs/")
      .register(import.meta.env.BASE_URL + "sw.js")
      .then((reg) => {
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
