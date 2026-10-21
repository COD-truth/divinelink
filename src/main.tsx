import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { checkAndHandleWipeUrl } from "@/lib/wipe";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Last-resort catch for stale-chunk errors thrown OUTSIDE React's render cycle
// (e.g. a lazy import rejecting in an event handler). Reload once to get fresh
// assets; the flag prevents any loop.
if (typeof window !== "undefined") {
  const RELOAD_FLAG = "dl.chunkReload.v1";
  const looksLikeChunkError = (msg: string) => {
    const m = (msg || "").toLowerCase();
    return m.includes("dynamically imported module") || m.includes("loading chunk") || m.includes("importing a module script failed");
  };
  const maybeReload = (msg: string) => {
    if (!looksLikeChunkError(msg)) return;
    try {
      if (sessionStorage.getItem(RELOAD_FLAG) === "1") return;
      sessionStorage.setItem(RELOAD_FLAG, "1");
    } catch { /* ignore */ }
    window.location.reload();
  };
  window.addEventListener("error", e => maybeReload(String(e?.message || "")));
  window.addEventListener("unhandledrejection", e => maybeReload(String((e as PromiseRejectionEvent)?.reason?.message || "")));
}

(async () => {
  const wiped = await checkAndHandleWipeUrl();
  if (wiped) return;
  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
})();

// Register PWA service worker for ALL builds (per offline-first spec),
// except inside Lovable preview iframes which would otherwise serve stale shells.
const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();
const host = window.location.hostname;
const isPreviewHost =
  host.includes("lovableproject.com") ||
  host.includes("id-preview--");

if ("serviceWorker" in navigator) {
  if (!isInIframe && !isPreviewHost) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").then((reg) => {
        // When a new SW takes over, reload the page so fresh assets are shown immediately.
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "activated") {
              window.location.reload();
            }
          });
        });
      }).catch(() => {});
    });
  } else {
    // Defensive: clear any previously registered SW in dev/preview to avoid stale caches.
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    }).catch(() => {});
  }
}
