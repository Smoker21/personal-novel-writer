import { tauriInvoke } from "./tauri.js";

export async function pickFolder(): Promise<string | null> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    const result = await tauriInvoke<string | null>("open_directory_dialog");
    return result;
  }
  // dev fallback: prompt for absolute path
  const path = window.prompt("dev 模式：輸入資料夾絕對路徑");
  return path ?? null;
}
