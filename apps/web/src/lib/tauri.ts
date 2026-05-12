// Tauri command 包裝（開發時 fallback 到 no-op）
// 正式 Tauri 環境：@tauri-apps/api/core invoke
// Web dev 環境：mock

export async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  // 在 Tauri WebView 中：用 @tauri-apps/api
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(command, args);
  }
  // Dev fallback
  throw new Error(`Tauri command "${command}" not available in browser dev mode`);
}
