# M6 開工前討論文件

> **收信人**：PM + spec-architect
> **寄信人**：dev 端
> **日期**：2026-05-17（v0.2.0 release 同日）
> **目的**：v0.2.0 已發佈，M6 開工前 PM 與 spec-architect 需要就 5 個議題拍板，dev 才能起 M6-Handover-instruction.md
> **狀態**：草稿，等 PM + spec-architect 共識

---

## 議題索引

| # | 議題 | 主要決策者 | 為何卡 |
|---|---|---|---|
| **D1** | M6 scope 大小（純品質 vs 品質+功能） | PM | 影響 milestone 預估時程 |
| **D2** | 是否正式收集 v0.2.0 真實使用者 feedback | PM | 影響 M6 plan 要不要保留調整空間 |
| **D3** | status-updater 卡住問題的優先級 | PM | 影響 M6 第一週 scope |
| **D4** | 跨 spec UI 元件 canonical 規格的維護方式 | spec-architect | 影響 spec 撰寫流程 |
| **D5** | dev 遇到 spec 沒寫的小決策時的處理流程 | PM + spec-architect | 影響 dev 自治邊界 |

---

## D1. M6 scope 大小

### 背景

v0.2.0 完成 M5 全部功能 spec（002/003/005/006/007/008/009），但 PM 同意「本次忽略 BDD」直接 release，所以有兩個尾巴：

1. **M5 沒做的** — BDD step defs（7 份 .feature 草稿沒對應 cucumber step）+ D1 共用元件單元測試 + TD-4~8 拋光
2. **M5 衍生的** — status-updater 卡住三層修復 + v0.2.0 user feedback 收集

加上原本 M6-backlog.md 已有：
- **S1** 全文搜尋（FTS5 over .md，5-8 PR）
- **S2** 跨專案 preset 庫（新 ADR，8-12 PR）

### 三個選項

| 選項 | 內容 | Pros | Cons | dev 預估 PR 數 |
|---|---|---|---|---|
| **A. 純品質** | M5 尾巴 + status-updater + user feedback | scope 乾淨、技術債清零；spec 階段短 | 無 user-visible 新功能；user 看 release 沒亮點 | 14~19 PR |
| **B. 品質 + S1** | A + S1 全文搜尋 | 有 user-visible 功能；FTS5 與 cache-db 同層、技術上不衝 | scope 變大；FTS5 牽涉 ADR-0001 補強；spec 階段拉長 | 19~27 PR |
| **C. 純品質 → M7 再 S1** | M6=A，M7=S1 | scope 最乾淨、最容易估時程 | M6 對 user 沒亮點；S1 拖到下下次 | 14~19 PR + 後續 |

### dev 推薦

**B（品質 + S1）**。理由：
- S1 在技術面與既有 cache-db / SQLite 同層，做起來不會有架構衝突
- M6-backlog 已寫過 S1 的 scope 雛形，spec 階段成本不大
- user feedback 視窗（D2）若同時收，可在 M6 中段根據 user 反饋調整 S1 排序

### 影響的 PR 順序（若選 B）

```
Week 1: M6-A BDD step defs 起手（先建 cucumber 骨架）
        M6-C status-updater 卡住三層修復（同時跑）
Week 2-3: M6-B 共用元件單元測試
          M6-A 把 7 份 .feature 全跑通
Week 3-4: S1 全文搜尋 spec → dev
Week 4-5: M6-D 拋光
Week 5+: M6-E user feedback 處理（持續）
```

**PM 拍板：A / B / C**

---

## D2. v0.2.0 user feedback 收集

### 背景

M5 dev 中後段我自己跑 chrome-devtools-mcp 手測抓到 5 個 bug（已修，+3 個 regression test 鎖死）。
M5 沒有 BDD step def 跑全 .feature，所以**真實使用者實際操作 30 分鐘可能再噴 3~5 個 bug**。

### 兩個選項

| 選項 | 行動 | Pros | Cons |
|---|---|---|---|
| **A. 正式開 issue 收 feedback** | GitHub issue「v0.2.0 user feedback log」，release 後 1~2 週收 | 系統化收集；後續可追溯 | 需要 user 自己回報 |
| **B. 不開** | 使用者噴問題時直接跟 PM 講 | 流程輕 | 散落沒記錄；M6 中期排序失準 |

### dev 推薦

**A**。理由：使用者就是 PM 自己，正式 issue 也能逼自己回報；後續 spec 變更紀錄段可引用該 issue。

**PM 拍板：A / B**

---

## D3. status-updater 卡住問題

### 背景（已在 v0.2.0-pm-report.md §2.3 詳述）

採用 AI 章節後「狀態更新中…」會卡住的 root cause：
1. statusUpdater routing 指向 `google:gemini-2.5-flash`，有時 timeout / quota issue
2. job-event-bus 30s 內沒新 event 就 SSE timeout，client 沒收到 `failed` 事件 → phase 卡 running

### 三層修法

| 層 | 內容 | 效果 |
|---|---|---|
| **L1** status-updater service | 加 90s timeout + 強制 emit `failed` | LLM 真的卡 90s 就放棄、emit 給 client |
| **L2** StatusUpdateIndicator | 加 60s client timeout + 重連邏輯 | client 端不會無限等下去 |
| **L3** job-event-bus SSE timeout | 30s → 5min | SSE 不會在 LLM 還在跑時就 close |

### 三個選項

| 選項 | 排程 | 觸發條件 |
|---|---|---|
| **A. P0** | M6 第一週做完 | 影響使用者每次採用流程 |
| **B. P1** | M6 中段（W2~3） | 不擋 M6 開頭，BDD 做完後一起測 |
| **C. defer** | 等 user 抱怨再修 | 影響有限（資料不會壞，只有 UX 不好）|

### dev 推薦

**B（P1）**。理由：
- 資料安全性 OK（章節已 commit、git 有紀錄）
- 只是 UX 看起來像壞掉
- M6 BDD step def 起手後可順手寫一個 status-updater fail scenario，順便驗 fix 正不正確
- 與其在第一週同步做 BDD + status-updater + user feedback 三條線，不如先把 BDD 打通

**PM 拍板：A / B / C**

---

## D4. 跨 spec UI 元件 canonical 規格

### 背景

M5 round 2 PM 提出「ExpandableTextarea / Spinner / Error 三層」要跨 spec 一致，最後規格放在 spec 002 為 canonical，其他 spec cross-reference。這個方式運作 OK 但有幾個觀察：

| 觀察 | 影響 |
|---|---|
| spec 002 變成「角色卡 + 共用元件」混合，職責不純 | 找元件規格要去 spec 002 不直覺 |
| 新 spec 起手時 spec-architect 第一輪沒掃跨 spec 元件（M5 round 1 才補） | spec round 數變多 |
| 共用元件實作時 dev 必須 cross-read 多份 spec 才能確認介面 | dev 起手成本增加 |

### 三個選項

| 選項 | 內容 | Pros | Cons |
|---|---|---|---|
| **A. 維持現狀** | canonical 規格放某份 spec，其他 cross-reference | 不動既有架構 | 上述問題仍在 |
| **B. 新增 `docs/architecture/specs/_components/` 子目錄** | 跨 spec UI 元件獨立成 spec：`_components/expandable-textarea.md` / `_components/spinner.md` / `_components/error-display.md` 等 | 職責清楚；新元件好找 | 多一層 spec 結構 |
| **C. 寫入 ADR** | ADR-00XX「跨 spec UI 元件設計慣例」+ 列舉現有元件 | 為跨切面決策；改動成本最低 | ADR 較重，元件變動時要更新 |

### dev 推薦

**B**。理由：M5 已經有 4 個共用元件（PortraitGrid / ExpandableTextarea / Spinner / ModelDropdown）+ 即將進 M6 的 ContextPreviewPanel / ResetConfirmDialog 等，數量已經值得分目錄。

新元件流程：
```
spec-architect 起新 spec 時：
1. 先讀 _components/ 目錄
2. 識別新 UI 需求中哪些是共用、哪些是 spec-local
3. 若是共用 → 寫新 _components/<name>.md（或補進既有）
4. spec 主檔 cross-reference 即可
```

### spec-architect 拍板

**A / B / C**

---

## D5. dev 遇到 spec 沒寫的小決策時的處理流程

### 背景

M5 dev 中我遇到兩個 spec 沒寫的決策、自己做了（事後在 v0.2.0-pm-report.md §2.4 記錄）：

1. **Spec 006 dirty draft 確認搬到 spec 006 為正本** — PM round 2 已認可
2. **注入 settings 級 systemPromptOverride 為 build-prompt 預設** — 沒明寫的小決策，dev 直接補上

兩個都沒造成問題，但流程上不夠正式：
- PM 不知道 dev 做了什麼決策
- spec 變更紀錄段沒記
- 未來改 spec 時可能覆蓋掉這個決策

### 三個選項

| 選項 | dev 自治邊界 |
|---|---|
| **A. 鬆** — dev 自決小事，事後 PR 提一行就好 | dev 跑得快；但決策記錄散落 |
| **B. 嚴** — 凡 spec 沒寫的決策一律暫停、開 advisor 或回 PM/spec-architect | 決策有跡可循；dev 速度慢 |
| **C. 中** — 影響合約（API shape / 跨檔行為）的決策要回 spec-architect 補 spec；純實作細節（hook 順序 / state 管理）dev 自決 | 邊界清楚；需要明文判別準則 |

### dev 推薦

**C**。具體做法：

| 類型 | 處理 | 範例 |
|---|---|---|
| 純實作細節 | dev 自決，PR 描述帶過 | useEffect 依賴陣列、CSS class 命名 |
| 影響元件 props / API shape | 開 advisor → 確認 → dev 自決 → PR 註明 | 加一個 optional prop |
| 跨檔行為 / 觸發時機 | 回 spec-architect 補 spec 變更紀錄段 → 才動工 | 「settings 級 prompt 在哪個時間點注入」這類 |
| 跨 spec 一致性 | 回 PM round review | 「dirty draft modal 行為定義在哪份 spec」這類 |

### PM + spec-architect 共同拍板

**A / B / C**

---

## 統整：PM 拍板結果（2026-05-17）

| 議題 | dev 推薦 | **PM 拍板** | 差異說明 |
|---|---|---|---|
| D1 scope | B（品質 + S1）| **A（純品質）** | S1 推 M7；M6 改含 P1 xiaohuangwen |
| D2 feedback | A（正式開 issue）| **B（不開，直接開 session）** | 使用者=PM 自己，流程越輕越真實 |
| D3 status-updater | B（P1, W2~3）| **A（P0, W1）** | 採用核心流程必修，root cause 已知 |
| D4 UI 元件 spec | B（`_components/`）| **B** | — |
| D5 dev 自治邊界 | C（明文準則）| **C** | — |

### M6 確定 scope（依此起草 Handover-instruction.md）

| 優先 | 任務 | 時間 |
|---|---|---|
| P0 | **M6-C status-updater 三層修復**（L1/L2/L3）| W1 |
| P0 | **M6-A BDD step defs**（7 份 .feature 全跑通）| W1 起手，W2 完成 |
| P1 | **M6-B 共用元件單元測試** | W2~3 |
| P1 | **M6-D 拋光**（TD-4 design token + TD-5~8）| W3~4 |
| P1 | **P1 xiaohuangwen provider**（章節寫作專用）| W3~5 |
| 流程 | **D4 `_components/` 子目錄**（spec-architect 起）| W1 配合 spec 修訂 |
| 流程 | **D5 dev 自治邊界**（補進 CLAUDE.md 或 milestone brief）| W1 |

S1（FTS5 全文搜尋）/ S2（preset 庫）→ **M7**

---

## 變更紀錄

- 2026-05-17：初版，等 PM + spec-architect 拍板
- 2026-05-17：PM 拍板完成，D1~D5 全部確定，M6 scope 定案
