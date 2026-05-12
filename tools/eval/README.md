# `tools/eval` — model-evaluation CLI

> 對應計劃：[docs/architecture/model-evaluation/eval-tool-plan.md](../../docs/architecture/model-evaluation/eval-tool-plan.md)

把 `docs/architecture/model-evaluation/test-cases/*.md` 跑一遍，
對指定 LLM runtime（首選：本機 RWKV-Runner）發 chat completion，
再把模型輸出與**機器可判定**的評分填回 result markdown 對應欄位；
主觀維度保留 `_/5` 等待人工。

## 安裝與啟動

```bash
cd tools/eval
pnpm install
```

需要 Node 18+ 與 pnpm。

> **建議 Node 22+**（與專案 ADR 一致）。Node 18 / pnpm 8 也能跑，但若有版本衝突建議升級。

## 用法

### 0. 確保 RWKV-Runner 啟動且模型已載入（idempotent）

```powershell
pwsh ./scripts/ensure-rwkv-runner.ps1
```

這個腳本會：
- 檢查 backend 是否在 `http://127.0.0.1:27777`
- 沒有的話就用 `ai-model/RMKV/.venv` 的 Python 啟動 backend
- 檢查模型是否已載入（status=3=Working）
- 沒有的話 POST `/switch-model` 用 `cuda fp16` 載入 7B 模型

如果 backend + 模型都已就緒，腳本 ~1s 內結束、不會重新載入。
重點：**這樣就可以反覆執行 eval 而不用等模型重新載入。**

### 1. 健康檢查

```bash
node dist/cli.js --endpoint http://127.0.0.1:27777/v1 --health
```

### 2. 對 RWKV-Runner 跑全套（model 已 hot 的情況）

```bash
node dist/cli.js \
  --endpoint http://127.0.0.1:27777/v1 \
  --result ../../docs/architecture/model-evaluation/results/2026-05-10-rwkv-5-h-world.md
```

跑完會產出兩個檔案：
- `<result>.md` — 評分卡（自動評分填回原本的 `_/5` 欄位 + TC-05 rerun 表格 + TC-07 記憶衰減觀察）
- `<result>-output.md` — 完整 system / user prompt + 模型完整輸出 + 取樣參數 + 自動評分（給人類詳閱）

如果是再次 re-run，請加 `--reset-from <template>` 把 result 檔還原到乾淨範本，否則先前填好的 placeholder 會留下舊資料。

### 3. 只跑指定 case

```bash
pnpm dev --result ../../docs/architecture/model-evaluation/results/2026-05-10-rwkv-5-h-world.md --only TC-04,TC-07
```

### 4. Dry-run（顯示要打哪些 prompt 不實際呼叫）

```bash
pnpm dev --result ../../docs/architecture/model-evaluation/results/2026-05-10-rwkv-5-h-world.md --dry-run
```

### 5. 對 LM Studio / Ollama 跑（OpenAI-compatible）

```bash
pnpm dev --target lm-studio --endpoint http://localhost:1234/v1 \
         --result ../../docs/architecture/model-evaluation/results/2026-05-10-qwen3.5-35b-a3b-iq4xs.md
```

### CLI flags

| flag | 說明 |
|------|------|
| `--target <runtime>` | `rwkv-runner`（預設）/ `lm-studio` / `ollama` |
| `--endpoint <url>` | 覆寫 runtime endpoint |
| `--result <path>` | result markdown 路徑（讀＋寫） |
| `--only <ids>` | 只跑指定 case（逗號分隔，如 `TC-01,TC-04`） |
| `--dry-run` | 只列計劃，不呼叫 LLM |
| `--max-tokens <n>` | 全域覆寫 max_tokens |
| `--json-out <path>` | 額外輸出 raw JSON 報表 |
| `--output-md <path>` | 完整輸入/輸出 markdown（預設 `<result>-output.md`） |
| `--reset-from <template>` | 跑前先把 `--result` 從乾淨範本覆蓋一次 |
| `--health` | 只檢查 runtime 然後退出 |
| `-y, --yes` | 略過所有互動確認 |

## RWKV-Runner 啟動前置

工具會做健康檢查但**不**啟動 RWKV-Runner。請先：

1. 啟動 RWKV-Runner（Windows 直接跑 .exe）
2. 「模型」頁載入 `.pth` 檔
3. Strategy 設 `cuda fp16i8 *20+`（依顯卡調）
4. 點「Run」等綠燈
5. 確認 `http://localhost:27777/v1/models` 回 200

詳見 [`runtimes/rwkv-runner.md`](../../docs/architecture/model-evaluation/runtimes/rwkv-runner.md)。

## 測試

```bash
pnpm test               # 跑一次
pnpm test:watch         # 監視
pnpm coverage           # 覆蓋率報表
```

當前覆蓋率約 80%（line），單元測試包含：
- parsers（test-case markdown、章節 sections）
- scoring rules（word-count、json、繁中、英文、人名、disclaimer、format、keyword）
- runtimes（mock fetch 對 RWKV-Runner client）
- runner / orchestrator（fake runtime 跑 end-to-end 寫回 markdown）
- reporting（snapshot 對真實 result template）

## 專案結構

```
tools/eval/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
├── src/
│   ├── cli.ts                # commander 入口
│   ├── config.ts             # 採樣 profile、runtime profile
│   ├── types.ts              # 全域 TS interfaces
│   ├── parsers/
│   │   ├── md-sections.ts    # 通用 markdown section / fence 抽取
│   │   └── test-case-parser.ts
│   ├── runtimes/
│   │   ├── runtime.ts        # interface
│   │   └── rwkv-runner.ts    # OpenAI-compat client（同樣支援 LM Studio / Ollama）
│   ├── runner/
│   │   ├── case-runner.ts    # 單一 case 執行（含 rerun）
│   │   └── orchestrator.ts   # 全套編排
│   ├── scoring/
│   │   ├── scorer.ts         # case → 維度評分 dispatch
│   │   └── rules/            # 個別規則（純 function）
│   ├── reporting/
│   │   └── report-writer.ts  # 寫回 result markdown
│   └── utils/
│       ├── logger.ts
│       └── text.ts           # countChineseChars, longest common substring
└── test/                     # vitest，鏡像 src/ 結構
```

## 設計筆記

- **為何放 `tools/`**：dev-time 評估工具，不會被 `apps/` 引用。`packages/` 留給會被 build 拉進去的 library。
- **為何先不接 `packages/llm-adapter`**：adapter 尚未實作；本工具的 `Runtime` interface 故意設成可被 `LLMProvider` 替代。
- **為何用 OpenAI-compat client 統包多 runtime**：RWKV-Runner / LM Studio / Ollama 都提供 OpenAI 形 API；採樣參數 / stop tokens 透過 per-runtime profile 區分（見 `src/config.ts`）。
- **採樣 profile**：依 [runtimes/rwkv-runner.md](../../docs/architecture/model-evaluation/runtimes/rwkv-runner.md)，TC-01/03/06/07/08 用 `creative`，TC-02/04/05 用 `instruct`。

## 已知限制

- Node 18 + pnpm 8 — 建議升級到 Node 22 / pnpm 10
- 單一 system + single user message；TC-07 變體靠在 user prompt 末尾追加說明達成
- TC-03 / TC-07 上下文較長，預設 timeout 120s；OOM 時請在 RWKV-Runner UI 降 strategy 或 chunk size
- 自動評分對主觀維度（語意、節奏、含蓄度）刻意留 `_/5` 給人工判定
