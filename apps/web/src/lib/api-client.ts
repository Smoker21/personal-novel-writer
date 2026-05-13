// Hono RPC client — dev 時 proxy 到 localhost:3001；prod 走 Tauri command 取 port
// M0 只建立骨架，具體 endpoint 呼叫在 M1 加入

// 型別 import：type-only，不引入 runtime 依賴
// import type { AppType } from "../../../api/src/server";

// Placeholder until apps/api AppType is stable
export type ApiClient = Record<string, unknown>;

export function getBaseUrl(): string {
  // dev：Vite proxy 處理；prod：從 Tauri command 取 port
  return "";
}
