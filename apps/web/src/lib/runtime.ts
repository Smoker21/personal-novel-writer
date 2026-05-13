import { tauriInvoke } from "./tauri";

let cachedBase: string | null = null;

/**
 * Returns the base URL for the Hono sidecar API.
 *
 * - Tauri environment: reads port from get_api_port command (~/.novel-writer/.runtime.json)
 * - Browser dev environment: returns http://127.0.0.1:3001 (Vite proxy target)
 *
 * Result is cached after the first call.
 */
export async function getApiBase(): Promise<string> {
  if (cachedBase !== null) return cachedBase;

  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    const port = await tauriInvoke<number>("get_api_port");
    cachedBase = `http://127.0.0.1:${port}`;
  } else {
    cachedBase = "http://127.0.0.1:3001";
  }

  return cachedBase;
}
