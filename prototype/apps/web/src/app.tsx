import { useEffect } from "react";
import { useHealthStore } from "./stores/health-store.js";

export function App() {
  const { status, fetch: fetchHealth } = useHealthStore();

  useEffect(() => {
    void fetchHealth();
  }, [fetchHealth]);

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col items-center justify-center">
      <h1 className="text-2xl font-ui font-semibold mb-4">Novel Writer</h1>
      <p className="text-sm text-ink/60 mb-2">v0.1-dev</p>
      <div className="text-xs text-ink/40">
        {status === "loading" && "connecting to sidecar…"}
        {status === "ok" && "✓ sidecar connected"}
        {status === "error" && "⚠ sidecar unreachable"}
      </div>
    </div>
  );
}
