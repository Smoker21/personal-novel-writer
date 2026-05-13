# Milestones — MVP v0.1 開發里程碑

> Status: **規劃完成**（2026-05-12），M0 待開工
> 目的：把 MVP 規格層（9 spec + 4 ADR + 3 Agent/Skill 規格）切成 5 個漸進交付的 milestone，每個都是 demo-able 的中間成果，可單獨交給一個 dev session 執行

## 切法原則

1. **每個 milestone 都 demo-able**：使用者能跑一輪實際操作，不是純基礎建設
2. **依依賴序漸進**：後一個 milestone 只依賴前面所有 milestone 的產出
3. **每個 milestone 自包含 brief**：文件內含開工 prompt、範圍、DoD、給下個 session 不需讀前後 context 也能動工
4. **失敗時可獨立 rollback**：milestone N 出問題不影響 N-1 的可用性

## 5 個 milestone 概要

| M | 名稱 | demo（一句話） | 依賴 spec / ADR | 預估範圍 |
|---|------|----------------|----------------|---------|
| [M0](./M0-foundation.md) | 基礎建設 | 應用能啟動、跑健康檢查、能對 Anthropic 跑一次 LLM 呼叫 | ADR 0001-0008 | ≈ 20-30 PR |
| [M1](./M1-writing-skeleton.md) | 寫作骨架（無 AI） | 建專案 → 編章節 → 儲存（git commit）→ 重開應用回到原章繼續寫 | Spec 001/003/008/009*/010* + Story 004/032 | ≈ 30-40 PR |
| [M2](./M2-characters-and-ai-writing.md) | 角色卡 + AI 撰寫 | 編角色卡（AI 統整）+ AI 寫整章（串流到草稿側欄），但**還不能採用** | Spec 002/005/009 + chapter-writer + character-card-consolidator | ≈ 25-35 PR |
| [M3](./M3-memory-loop.md) | 記憶閉環 + git 歷史 | 採用草稿 → 自動更新 status → 寫下一章 AI 仍記得；git 歷史面板可預覽 / 還原 / diff | Spec 006/007/010 + status-updater + status-shortener | ≈ 25-35 PR |
| [M4](./M4-polish-and-release.md) | 打磨與發布 v0.1.0 | 三平台 binary 發布、衝突 UX 完善、使用者手冊齊備 | 衝突處理 + 跨平台打包 + 視覺拋光 | ≈ 15-25 PR |

\* M1 的 Spec 009 僅 providers 與連線測試部分；per-Agent routing UI 在 M2 補完
\* M1 的 Spec 010 僅 commit timing 與 git status 偵測；歷史 / diff / revert UI 在 M3 補完

## MVP 完成定義

M4 結束時：

- [ ] 使用者能在 Windows / Mac / Linux 上安裝執行
- [ ] 完成「**MVP 撰寫故事閉環**」端對端：
  1. 啟動 → 首次警語 → 主頁
  2. 設定 LLM provider → 連線測試通過
  3. 「新小說」→ 填三要素 → 進編輯器
  4. 編寫 / AI 撰寫 / 採用一個或多個章節
  5. 採用後 status 自動更新，下一章撰寫時 chapter-writer 已讀到新 status
  6. 關閉應用 → 重開 → 「最近開啟」→ 繼續寫作
  7. 「歷史」面板能看 git commit 歷史並還原任意版本
- [ ] 全部 P0 stories 對應的 .feature 之 BDD step definitions 跑得通
- [ ] vitest 單元測試覆蓋率對 critical path ≥ 70%
- [ ] GitHub Releases 有 v0.1.0 三平台 binary

## 依賴順序視覺化

```
                  ┌───────────────────────┐
                  │  M0 基礎建設           │
                  │  ──────────────       │
                  │  monorepo + Tauri +   │
                  │  Hono + git wrapper + │
                  │  LLM adapter 骨架      │
                  └────────────┬──────────┘
                               │
                  ┌────────────▼──────────┐
                  │  M1 寫作骨架（無 AI）  │
                  │  ──────────────       │
                  │  設定頁基礎 + git +    │
                  │  建專案 + 編章節 +     │
                  │  IndexedDB 兩層儲存    │
                  └────────────┬──────────┘
                               │
                  ┌────────────▼──────────┐
                  │  M2 角色卡 + AI 撰寫   │
                  │  ──────────────       │
                  │  角色卡 + AI 統整 +    │
                  │  chapter-writer 串流   │
                  └────────────┬──────────┘
                               │
                  ┌────────────▼──────────┐
                  │  M3 記憶閉環 + git 歷史 │
                  │  ──────────────       │
                  │  採用 + status-updater │
                  │  + AI 精簡 + history UI│
                  └────────────┬──────────┘
                               │
                  ┌────────────▼──────────┐
                  │  M4 打磨與發布 v0.1.0  │
                  │  ──────────────       │
                  │  跨平台打包 + 衝突 UX  │
                  │  + 使用者手冊 + 拋光   │
                  └───────────────────────┘
```

## 給下個 session 的協作模式

每個 milestone 文件是**自包含的開工 brief**：

1. 拿到 milestone brief（例 `M0-foundation.md`）
2. 不需要讀本 session 的 context；brief 包含所有必要資訊
3. 動工 → 依文件中的「任務拆解」實作
4. 每個 PR 對應一條任務（或數條相關任務）
5. milestone 結束時跑「驗收 walk-through」確認 demo
6. 在 milestone 文件最末填「完成紀錄」段落

### 各 milestone 適合的 session 安排

| Milestone | 適合的 session 模式 |
|---|---|
| M0 | 單一 session 全程；任務密集且依賴強，不適合切多 session |
| M1 | 單一 session 全程；或拆「後端」session + 「前端」session 兩條線（依賴薄） |
| M2 | 可拆三條線：(a) 角色卡 (b) AI 撰寫鏈 (c) 設定頁 UI 補完 |
| M3 | 可拆兩條線：(a) 採用 + status-updater (b) git 歷史 UI |
| M4 | 多 session 並行：(a) 打包 / CI (b) UX 拋光 (c) 使用者手冊 |

## Milestone 切換 checklist

從 M_N 切到 M_{N+1} 前：

- [ ] M_N 的所有任務 PR 已 merge 到 main
- [ ] M_N 的 demo walk-through 跑得通
- [ ] M_N 的 spec 對應 BDD step definitions 全部 pass
- [ ] M_N 文件末尾填好「完成紀錄」（含實際時程、踩雷、調整）
- [ ] 主 `docs/architecture/specs/README.md` 的 Status 欄更新（spec 從 Ready → Frozen）

## 範圍變更協議

如果 milestone 執行中發現 spec 需要修改：

1. **小調整**（不影響其他 milestone）：直接改 spec + 更新 milestone 文件「實際範圍 vs 計劃範圍」段
2. **重大變更**（影響其他 milestone）：暫停實作 → 走 spec-architect → 退回 product-manager 釐清 → 更新 ADR / spec → 再動工
3. **scope creep**（想多做 P1 P2）：寫 backlog 不擠進當前 milestone

## 變更紀錄

- `2026-05-12`: 初版規劃（M0-M4 完整）
