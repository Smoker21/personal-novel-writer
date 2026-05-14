# QA — 人工驗證報告

> 給使用者（PM）動工 M4 前的人工驗證階段使用。

## 為什麼有這個目錄

M0~M3 已完成（401 vitest tests pass），但測試只覆蓋後端邏輯。**前端 UX 與 BDD scenarios 從未被人工跑過一輪**。M4 brief 的 `pol-*` / `conf-*` / `on-*` / `qa-*` 任務都需要具體改善方向，這份報告 = M4 任務的輸入。

## 兩份報告

| 檔案 | 用途 | 填寫者 |
|---|---|---|
| [m4-ux-review.md](./m4-ux-review.md) | 跑應用每個 UI 表面（21 個）一輪，記錄功能 / 視覺 / 互動 / 錯誤處理問題 | 使用者 |
| [m4-bdd-review.md](./m4-bdd-review.md) | 對著 12 個 .feature（108 scenarios）手工跑，判斷實作與 spec 是否一致 | 使用者 |

## 流程

```
1. 跑 pnpm tauri dev 啟動應用
2. 開 m4-ux-review.md，跑 21 個 UI 表面，填 ✅/⚠️/❌ + 改善意見
3. 開 m4-bdd-review.md，跑 108 個 scenarios，填 ✅/⚠️/❌/🚫 + 改善意見
4. 把改善意見對應到 M4 任務 ID（brief 中的 pol-* / conf-* / on-* / qa-*）
5. commit 兩份檔到 main
6. 開新 session 動工 M4，dev 讀填好的報告轉成 PR 任務
```

## 與 M4 brief 的關係

- M4 brief 列出**任務清單**（pol-1~10 / conf-1~4 / on-1~4 等）
- 本目錄報告填**具體改善項目**對應到任務 ID
- dev session 動工時兩者都讀

## 不在這裡

- 自動化測試（vitest / Playwright 在 apps/api/tests/ 與將來的 apps/e2e/）
- BDD step definitions 實作（M4 qa-1 任務本身）
- 截圖（M4 doc-7 任務）
