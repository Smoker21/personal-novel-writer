// M1-C: broadcast-channel 多 tab 偵測骨架；Tauri 預設單視窗，本 module 留 M3 啟用
export function noopChannel(): { close: () => void } {
  return { close: () => {} };
}
