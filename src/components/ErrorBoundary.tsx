import React from "react";

/**
 * App-wide safety net.
 *
 * Before this existed, ANY error thrown while rendering a screen unmounted the
 * whole React tree → the app went blank until a manual refresh. The most common
 * trigger was a stale cached shell after a redeploy asking for a lazy-loaded
 * chunk whose hashed filename had changed ("Failed to fetch dynamically imported
 * module") — so a device holding the old build would blank on the next tap.
 *
 * This boundary:
 *  - Detects chunk / dynamic-import load failures and auto-reloads ONCE
 *    (guarded by sessionStorage so it can never loop) to pick up fresh assets.
 *  - For any other error, shows a friendly retry panel WITH the error text,
 *    instead of a silent white screen — so problems are visible, not mysterious.
 */

interface Props { children: React.ReactNode; }
interface State { error: Error | null; }

const RELOAD_FLAG = "dl.chunkReload.v1";

function isChunkLoadError(err: Error): boolean {
  const msg = `${err?.name || ""} ${err?.message || ""}`.toLowerCase();
  return (
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("importing a module script failed") ||
    msg.includes("loading chunk") ||
    msg.includes("loading css chunk") ||
    msg.includes("unexpected token '<'") // server returned index.html for a missing .js
  );
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // A stale-chunk error means the code on disk is newer than this tab.
    // Reload once to fetch the fresh build. The flag stops any reload loop.
    if (isChunkLoadError(error)) {
      let already = false;
      try { already = sessionStorage.getItem(RELOAD_FLAG) === "1"; } catch { /* ignore */ }
      if (!already) {
        try { sessionStorage.setItem(RELOAD_FLAG, "1"); } catch { /* ignore */ }
        window.location.reload();
        return;
      }
    }
    // Log for whoever is watching the console / future diagnostics.
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error);
  }

  private reset = () => {
    try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* ignore */ }
    this.setState({ error: null });
  };

  private hardReload = () => {
    try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* ignore */ }
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    // Chunk error whose auto-reload was already spent → show manual retry.
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        padding: "24px", background: "#f8fafc", color: "#0f172a",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}>
        <div style={{
          maxWidth: 420, width: "100%", background: "#fff", border: "1px solid #e2e8f0",
          borderRadius: 16, padding: 24, boxShadow: "0 10px 30px rgba(2,6,23,.08)", textAlign: "center",
        }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>⚠️</div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>
            Une erreur est survenue
          </h1>
          <p style={{ fontSize: 14, color: "#475569", margin: "0 0 16px" }}>
            L'application a rencontré un problème sur cet écran. Vos données sont
            en sécurité. Rechargez pour continuer.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button onClick={this.hardReload} style={{
              background: "#0d9488", color: "#fff", border: "none", borderRadius: 10,
              padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}>Recharger</button>
            <button onClick={this.reset} style={{
              background: "#f1f5f9", color: "#0f172a", border: "1px solid #e2e8f0",
              borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}>Réessayer</button>
          </div>
          <pre style={{
            marginTop: 16, textAlign: "left", whiteSpace: "pre-wrap", wordBreak: "break-word",
            fontSize: 11, color: "#94a3b8", maxHeight: 120, overflow: "auto",
          }}>{error.name}: {error.message}</pre>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
