# 0011. 技術棧升版策略與 LTS 對齊

- Status: `Accepted`
- Date: `2026-05-18`
- Deciders: PM, spec-architect
- Related: [ADR-0003](./0003-tech-stack.md)（既有技術棧）/ [ADR-0006](./0006-app-packaging.md)（Tauri 包裝）

## Context

M5 release v0.2.0 後，spec-architect 在 M6 預審階段掃出技術棧多項落後：

| 項 | 現況 | 落後幅度 |
|---|---|---|
| `engines.node` | `>=18.17.0` | Node 18 已 2025-04 EOL；使用者實際機器跑 v26.1.0 |
| `@types/node` | `^22` | 與 engines 不一致 |
| zod | api `^3.24` / prompt-library `^4.4` | 跨 workspace 版本漂移 |
| sharp | `^0.32.6` | M5 已踩 ABI mismatch（v0.2.0-pm-report §2.2）|
| 無 `.nvmrc` / `packageManager` | 多人協作與 CI 環境隨機 |
| Vite / Vitest / biome / Anthropic SDK / OpenAI SDK 等 | 1~6 個版本落後 |

技術債若不還，會持續引發：
1. 新貢獻者環境踩雷
2. native module（better-sqlite3 / sharp）ABI mismatch
3. 跨 workspace 類型漂移（zod 跨版本）
4. 新功能依賴的新 API 不可用（如 React 19 actions / Vite 6 native fetch）

但「全棧 major 同時升」風險過高 — M5 dev 中已驗證「同期多項升級難 root cause」（spec 005 / 009 修訂時遇過 zod 升半路造成 typecheck 噪訊）。

需要一份**升版策略 ADR** 釘住：什麼時候升、怎麼升、哪些子項該推到後續 milestone。

## Decision

### 三大原則

1. **LTS 對齊**：`engines.node` 永遠鎖目前 Node LTS major（不追 Current）。`@types/node` 與 engines 同 major。
2. **單 PR 單升**：每個依賴升版獨立 PR，方便 `git revert` 個別回滾。**禁止** all-in-one「升個夠」commit。
3. **拆 milestone**：UI 框架類 major（React / Router / Zustand）與其他主功能 milestone **不同期做** — 避免 hooks behavior / route loader API 變動與新 UI feature 撞 root cause。

### 升版優先級分類

| 類別 | 範例 | 處理 |
|---|---|---|
| **P0 必做** | `engines.node` LTS / 跨 workspace 版本一致（zod）/ native module 對齊（sharp / better-sqlite3 ABI） | 每個 milestone 起手第一週清 |
| **P1 工具鏈 major** | Vite / Vitest / biome / TS / Playwright | 與「品質補強」型 milestone 同期 |
| **P2 後端 SDK major** | Anthropic SDK / OpenAI SDK / Google GenAI | 與該 SDK 直接相關 feature milestone 同期（如 xiaohuangwen ⇄ LLM SDK major）|
| **P3 前端框架 major** | React / react-router-dom / Zustand | **獨立 milestone**；不與產品 feature 同期 |
| **P4 Rust toolchain** | Tauri Cargo `rust-version` | 獨立 milestone；含全平台 bundle 重測 |

### M6 採用範圍（與 M7 推延項對齊）

| 子項 | 分類 | M6 / M7 |
|---|---|---|
| Node engines `>=22` + `.nvmrc` + `packageManager` | P0 | M6 |
| `@types/node ^22` | P0 | M6 |
| zod 跨 workspace 統一 v4 | P0 | M6 |
| sharp `^0.34` | P0 | M6 |
| Vite 5 → 6 / Vitest 2 → 3 / biome 1 → 2 / TS 5.7 → 5.8 / Playwright 1.5x | P1 | M6 |
| Anthropic SDK / OpenAI SDK / Google GenAI 升 | P2 | M6（與 xiaohuangwen 同軌道）|
| Hono / better-sqlite3 / Dexie / Tailwind / CodeMirror / lucide-react / MSW / jsdom minor 升 | P1 | M6 |
| React 18 → 19 + react-router-dom 6 → 7 + Zustand 4 → 5 | P3 | **M7**（中段，FTS5 之後） |
| Tauri Cargo `rust-version` 1.77 → 1.85 | P4 | **M7** |

### 單 PR 升版 SOP

每個升版 PR 走相同流程：

```
1. 單一 dep 升版（pnpm up <pkg>@<target>）
2. tsconfig / lint config / vitest config 等同 PR 改完
3. 跑 pnpm typecheck + pnpm -r test，全綠才 push
4. 走 P2/P3 級時：跑 packages/llm-adapter/scripts/smoke.ts 對該 SDK
5. PR description 註明：
   - 升版前後版本
   - Breaking changes 清單（從 release notes 摘）
   - 影響到的 call site 列出
   - 回滾策略（revert PR 即可，或需配套 schema migration）
6. main 合進前 PM round（minor 不需 round；major 一定 round）
```

### Native module rebuild

任何 native module（better-sqlite3 / sharp）升版，PR 中**必須**：

1. 確認 root `postinstall: pnpm rebuild better-sqlite3 sharp` 仍有效
2. 在三平台（Windows / macOS / Linux，若有 CI 支援）跑一輪 install + smoke
3. 若 Node major 同期升（如本次 X-1）→ rebuild 必跑

### 失敗處理

升版 PR 出問題的處理：

| 情況 | 處理 |
|---|---|
| typecheck 紅 / 既有 test 紅 | 修在同 PR 內；不允許「先合再修」|
| smoke test 紅（P2 SDK） | revert PR；該子項推下個 milestone |
| Runtime regression（手測抓到） | revert + 補 regression test；該子項推下個 milestone |
| 跨平台 native binary 失效 | revert + 鎖在前一版本；該子項推到平台支援補齊後 |

### ADR 維護

每次大規模升版（如 M6-X / 未來 M7-Y / M8-...）：

- 在本 ADR 表「M6 採用範圍」段加新欄位記錄
- 不另立新 ADR（除非升版策略本身有變化）

## Consequences

**Positive:**
- 技術債清零有明確節奏：每個 milestone 起手清 P0 / 並行 P1
- UI 框架 major 不與產品 feature 同期 → QA 可分離 root cause
- 升版 PR 個別獨立 → 失敗易回滾、責任清楚
- 新貢獻者 `pnpm install` 一律走 LTS engines → 環境差異最小化

**Negative:**
- 單 PR 單升 → milestone 內 PR 數膨脹（M6-X 約 9~10 PR）
- P3 前端框架 major 延後 → 短期享受不到 React 19 / Suspense 新 API；M7 一次到位
- ADR 維護成本（每次大升版要追加紀錄）

**Neutral:**
- 不引入 Renovate / Dependabot 自動 PR — 個人本機工具，手動節奏更符合「我有 capacity 才升」
- 不強制 Node Current（24+）— LTS 對齊優先；使用者實際機器跑 v26.1.0 仍 OK（engines 是下限，不是上限）

## Alternatives considered

### A. 不訂策略，憑感覺升
- Pros: 流程輕
- Cons: M5 已經因此撞過 zod 跨版本漂移；無策略則錯誤會反覆發生
- 為何不選：違反「PM 偏好 simplification + 拿掉踩雷機制」（memory）

### B. 全棧大爆炸升（一次 PR 升所有 major）
- Pros: 一勞永逸
- Cons: 風險過高；無法 root cause；無法回滾
- 為何不選：M5 dev 已驗證 multi-version-jump 同 PR 是 anti-pattern

### C. 引入 Renovate auto-PR
- Pros: 自動化
- Cons: 個人本機工具不需要；PR 噪訊大；本應用更新節奏由 PM 控制
- 為何不選：YAGNI

### D. 鎖 Node Current（24+）而非 LTS
- Pros: 最新功能可用
- Cons: 半年一輪 major；社群套件支援度不如 LTS；個人工具不需要追新
- 為何不選：LTS 對齊原則優先

## References

- [ADR-0003](./0003-tech-stack.md) — 既有技術棧
- [ADR-0006](./0006-app-packaging.md) — Tauri 包裝（影響 Rust toolchain 升版時機）
- [M6-X-tech-refresh.md](../milestones/M6-X-tech-refresh.md) — M6 本次升版規劃文件
- [M6-backlog.md](../milestones/M6-backlog.md) — M7-Y1~Y4 推延項
