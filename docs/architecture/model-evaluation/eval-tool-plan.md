# 測試評估工具開發計劃

> Status: **已實作**（2026-05-10），位於 [`tools/eval/`](../../../tools/eval/)。M1~M6 全部完成。
> 目標讀者：另一個 Claude Code session 將依此計劃實作；本文檔自包含，無需本 session 上下文。
> 對應評估目標：[results/2026-05-10-rwkv-5-h-world.md](./results/2026-05-10-rwkv-5-h-world.md)
> 使用說明：[`tools/eval/README.md`](../../../tools/eval/README.md)

## 1. 任務目標

寫一支 CLI 工具 `eval`，把 8 個 test case（在 `docs/architecture/model-evaluation/test-cases/*.md`）對指定 LLM provider（首發目標：本機 RWKV-Runner）跑完，並把模型輸出與**機器可判定**的評分填回 result markdown 對應欄位，留主觀欄位給人工。

成功定義（DoD）：

1. `pnpm eval --target rwkv-runner --result results/2026-05-10-rwkv-5-h-world.md` 跑完所有 8 個 case
2. 該 result 檔的「輸出片段」區塊全部填好；自動可評分維度寫上分數與簡短說明；人工評分欄位保留 `_/5`
3. TC-05 自動跑 3 次並把字數寫進對應表格
4. TC-07 自動跑 2 個變體（原版 + 「重點搬末尾」版）
5. TC-04 / TC-08 三個子測都自動跑完並區分填入
6. 工具有 `--dry-run`（只顯示要打哪些 prompt 不實際呼叫）
7. 工具自身有 ≥ 60% 單元測試覆蓋（vitest）

## 2. 範圍

### In scope

- 解析 test case markdown，抽出 system / user prompt 與每個 case 的特殊規則（要跑幾次、變體、子測）
- 透過 RWKV-Runner 的 OpenAI-compatible HTTP API 跑（27777 port）
- 採樣參數依 case 切換（創作類 vs 指令類，依 [runtimes/rwkv-runner.md](./runtimes/rwkv-runner.md)）
- 自動評分（規則 based，見第 7 節）
- 把模型輸出與評分合併到 result template

### Out of scope（先不做）

- 自動評分小說品質（含蓄度、節奏感等）— 留人工
- 直接 spawn / 監控 RWKV-Runner 程序 — 假設使用者先手動啟動
- LLM-as-judge 評分 — 未來考慮，但會引入雲端成本與額外依賴
- 多模型並排比較報表 — 未來擴充
- 串流輸出（SSE）— 內部 call 用 `stream: false` 即可，不需逐字顯示

## 3. 技術選型

| 項目 | 選擇 | 替代 | 理由 |
|------|------|------|------|
| 語言 | **TypeScript（Node 22+）** | Python | 與專案主棧一致；未來可重用 `packages/llm-adapter` |
| 套件管理 | **pnpm** | npm / yarn | 與 [ADR-0003](../adr/0003-tech-stack.md) 一致 |
| HTTP client | **內建 fetch** | axios / undici | Node 18+ 內建，零依賴 |
| Markdown parse | **gray-matter** + 自寫 section parser | remark | 我們只需抽 frontmatter 與特定 heading 下的 code block |
| CLI | **commander** | 自寫 | 標準、好用、輕量 |
| Schema validation | **zod** | yup | 與專案 ADR 一致 |
| 測試 | **vitest** | jest | 與 ADR 一致 |
| Logger | **consola** 或 **chalk** + console | pino | 美觀彩色輸出，適合 CLI |
| 進度 UI | **ora** spinner + cli-progress | listr2 | 簡單夠用 |

## 4. 目錄結構

```
tools/
└── eval/
    ├── package.json
    ├── tsconfig.json
    ├── README.md                    # 給人類使用者
    ├── PLAN.md                      # 對應本檔（軟連結或複製）
    ├── src/
    │   ├── cli.ts                   # bin entrypoint，commander 設定
    │   ├── config.ts                # 載入設定（target、endpoints、採樣 defaults）
    │   ├── types.ts                 # 全部 TS interfaces
    │   ├── parsers/
    │   │   ├── test-case-parser.ts  # 解析 test-cases/*.md
    │   │   └── result-template.ts   # 解析與寫入 result markdown
    │   ├── runtimes/
    │   │   ├── runtime.ts           # Runtime interface（讓未來擴充）
    │   │   └── rwkv-runner.ts       # RWKV-Runner OpenAI-compat client
    │   ├── runner/
    │   │   ├── case-runner.ts       # 單一 case 執行（含子測 / 變體 / 多次）
    │   │   └── orchestrator.ts      # 全套執行編排
    │   ├── scoring/
    │   │   ├── scorer.ts            # 評分總 dispatch
    │   │   └── rules/
    │   │       ├── word-count.ts
    │   │       ├── json-validity.ts
    │   │       ├── traditional-chinese.ts
    │   │       ├── english-detection.ts
    │   │       ├── name-presence.ts
    │   │       └── disclaimer-detection.ts
    │   ├── reporting/
    │   │   └── report-writer.ts     # 寫回 result markdown
    │   └── utils/
    │       ├── logger.ts
    │       └── time.ts
    ├── test/
    │   ├── parsers/
    │   ├── scoring/
    │   └── fixtures/                # 假輸入輸出
    └── eval.config.ts               # 預設設定（採樣 / runtime endpoint）
```

**為何放 `tools/`** 而非 `packages/`：此工具是 dev-time 評估工具，不會被 `apps/` 引用。`packages/` 留給會被 build 拉進去的 library。

**為何先不加入 monorepo workspace**：root `package.json` 與 `pnpm-workspace.yaml` 還沒建立。先讓 `tools/eval` standalone（自有 package.json，無 workspace）。等專案正式進入實作階段再整併。

## 5. 模組設計

### 5.1 Runtime interface

```ts
// src/runtimes/runtime.ts

export interface RuntimeConfig {
  endpoint: string;                // e.g. http://localhost:27777/v1
  modelId?: string;                // 多數 OAI-compat 此欄不重要
  headers?: Record<string, string>;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  temperature: number;
  topP: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  maxTokens: number;
  stop?: string[];
}

export interface ChatResponse {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
  finishReason: "end" | "max_tokens" | "stop" | "error";
  durationMs: number;
}

export interface Runtime {
  readonly name: string;             // "rwkv-runner" | "lm-studio" | ...
  health(): Promise<{ ok: boolean; modelInfo?: string }>;
  chat(req: ChatRequest): Promise<ChatResponse>;
}
```

### 5.2 RWKV-Runner client

```ts
// src/runtimes/rwkv-runner.ts

export class RwkvRunnerRuntime implements Runtime {
  readonly name = "rwkv-runner";
  constructor(private cfg: RuntimeConfig) {}

  async health() {
    const res = await fetch(`${this.cfg.endpoint}/models`);
    return { ok: res.ok, modelInfo: await res.text() };
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const t0 = performance.now();
    const res = await fetch(`${this.cfg.endpoint}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.cfg.headers },
      body: JSON.stringify({
        model: this.cfg.modelId ?? "rwkv",
        messages: req.messages,
        temperature: req.temperature,
        top_p: req.topP,
        presence_penalty: req.presencePenalty,
        frequency_penalty: req.frequencyPenalty,
        max_tokens: req.maxTokens,
        stop: req.stop,
        stream: false,
      }),
    });
    if (!res.ok) throw new Error(`RWKV-Runner ${res.status}: ${await res.text()}`);
    const json = await res.json();
    const t1 = performance.now();
    return {
      text: json.choices[0].message.content,
      usage: {
        inputTokens: json.usage?.prompt_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
      },
      finishReason: mapFinishReason(json.choices[0].finish_reason),
      durationMs: t1 - t0,
    };
  }
}
```

### 5.3 Test case 解析

```ts
// src/types.ts

export type CaseId = "TC-01" | "TC-02" | "TC-03" | "TC-04" | "TC-05" | "TC-06" | "TC-07" | "TC-08";

export interface TestCaseRun {
  caseId: CaseId;
  variant?: string;          // "default" | "重點搬末尾" 等
  subtest?: string;          // "4-1" | "4-2" | "4-3" | "8-1" | "8-2" | "8-3"
  systemPrompt: string;
  userPrompt: string;
  sampling: SamplingProfile;
  maxTokens: number;
  rerun?: number;            // TC-05 等需要多跑
}

export interface SamplingProfile {
  temperature: number;
  topP: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
}
```

實作 `parseTestCases(globPattern: string): TestCaseRun[]`：

1. 對每個 `tc-XX-*.md` 跑：
   - 讀 frontmatter（推薦溫度等）
   - 找 `## System prompt` 下第一個 ` ``` ` code block → systemPrompt
   - 找 `## User prompt` 下第一個 code block → userPrompt
   - 若有 `## 子測 N-M`，每個子測各 emit 一個 `TestCaseRun`
2. 對 TC-05 加 `rerun: 3`
3. 對 TC-07 加變體：
   - default：原 user prompt
   - end-emphasis：在 user prompt 末尾插入「請特別注意：本章必須提到蘇晴帶來的母親照片。」

**簡化做法**：不要試圖通用解析任意 markdown 格式。直接針對每個 case ID 寫個別 mapper：

```ts
// src/parsers/case-mapper.ts
export const CASE_MAPPERS: Record<CaseId, (md: string) => TestCaseRun[]> = {
  "TC-01": parseSimpleCase,
  "TC-02": parseSimpleCase,
  "TC-03": parseSimpleCase,
  "TC-04": parseMultiSubtestCase,
  "TC-05": (md) => withRerun(parseSimpleCase(md), 3),
  "TC-06": parseSimpleCase,
  "TC-07": (md) => withVariants(parseSimpleCase(md), [
    { name: "default", transform: (p) => p },
    { name: "end-emphasis", transform: (p) => p + "\n\n請特別注意：本章必須提到蘇晴帶來的母親照片。" },
  ]),
  "TC-08": parseMultiSubtestCase,
};
```

這個比通用解析器穩，破嘴對齊既有 markdown 結構即可。

### 5.4 採樣參數對應

```ts
// src/config.ts

export const SAMPLING_PROFILES = {
  creative: {     // RWKV 創作類：TC-01, 03, 06, 07, 08
    temperature: 1.0,
    topP: 0.6,
    presencePenalty: 0.4,
    frequencyPenalty: 0.4,
  },
  instruct: {     // RWKV 指令類：TC-02, 04, 05
    temperature: 0.5,
    topP: 0.5,
    presencePenalty: 0.6,
    frequencyPenalty: 0.6,
  },
} as const;

export const CASE_PROFILE: Record<CaseId, "creative" | "instruct"> = {
  "TC-01": "creative",
  "TC-02": "instruct",
  "TC-03": "creative",
  "TC-04": "instruct",
  "TC-05": "instruct",
  "TC-06": "creative",
  "TC-07": "creative",
  "TC-08": "creative",
};
```

未來不同 runtime 可有不同 profile，這份是 RWKV 專屬。把這個對應表放在 `eval.config.ts`，CLI flag 可覆寫。

### 5.5 Orchestrator

```ts
// src/runner/orchestrator.ts

export interface RunContext {
  runtime: Runtime;
  resultTemplatePath: string;     // 既有的 result template
  resultOutputPath: string;       // 寫到哪（可能與 input 同檔）
  caseFilter?: CaseId[];          // CLI --only TC-01,TC-02
  dryRun: boolean;
}

export async function runEvaluation(ctx: RunContext): Promise<EvaluationReport> {
  // 1. health check
  // 2. parse test cases
  // 3. for each TestCaseRun:
  //    a. 計算採樣
  //    b. dryRun → 印 prompt 即跳過
  //    c. runtime.chat()
  //    d. 自動評分
  //    e. 累積到 EvaluationReport
  // 4. report-writer 把 report 寫回 result markdown
}
```

`EvaluationReport` 結構是中介資料，方便 testing 與 reporting 分離。

## 6. 執行流程

CLI：

```
eval [options]
  --target <runtime>        rwkv-runner | lm-studio | ollama (預設 rwkv-runner)
  --endpoint <url>          覆寫 endpoint
  --result <path>           result markdown 路徑（input + output 同檔）
  --only <case-ids>         僅跑指定 case，逗號分隔（例 TC-01,TC-02）
  --dry-run                 印 prompt 不呼叫
  --max-tokens <n>          覆寫 max_tokens
  --json-out <path>         額外輸出 raw JSON 報表
```

預設用法：

```
pnpm --filter eval start --result docs/architecture/model-evaluation/results/2026-05-10-rwkv-5-h-world.md
```

行為流：

1. 讀 result template → 抽出該模型的元資料（模型 ID 等）
2. 健康檢查 RWKV-Runner（GET /models）→ 失敗中止並指引使用者啟動 RWKV-Runner
3. 列出計劃要跑的 case 清單（含變體、子測、rerun），等使用者確認（除非 `--yes`）
4. 一個 case 一跑：
   - 顯示 spinner「Running TC-XX [variant] ...」
   - 計時、發 chat、收 response
   - 列印 token usage、duration
   - 跑自動評分
   - 把結果記到 in-memory report
5. 全跑完 → 把 report 寫回 result markdown：
   - 每個 case 的「輸出片段（前 N 字）」位置貼上實際輸出
   - 自動評分維度填上 `<分數>/5`，並在說明欄寫一句話為何
   - 主觀維度保留 `_/5` 等待人工
   - 「Architecture-specific observations」段填上自動偵測到的（記憶衰減比較、prompt 末尾差異等）
6. 終端顯示總結報表：通過 / 邊緣 / 不通過 case 數

## 7. 自動評分規則

每個 case 列出**機器能判定的維度**與**留人工**的維度。

### TC-01 角色一致性

| 維度 | 自動 / 人工 | 規則 |
|------|------------|------|
| 不新增未提供角色 | 自動 | regex 抓人名候選（連續 2-4 個常用人名字元集合）；過濾掉「蘇晴」「林書言」；剩餘 = 紅旗 |
| 不修改既有角色名 | 自動 | 全文 contains "蘇晴" 與 "林書言"；若任一缺 = 失分；若有「蘇情」「林書嚴」等近似誤寫 = 失分 |
| 角色屬性貼合卡片 | 人工 | 屬於語意理解 |

### TC-02 狀態提煉

| 維度 | 自動 / 人工 | 規則 |
|------|------------|------|
| 字數服從（< 1500 / < 2000） | 自動 | 計算各區塊字數 |
| 格式遵循 | 自動 | regex `^## story_status\.md` 與 `^## character_status\.md` 都存在 |
| 角色一致性 | 自動 | 同 TC-01 規則 |
| 關鍵劇情捕捉 | 人工 | 語意 |
| 精簡感 | 半自動 | 計算與輸入原文的 longest-common-substring 長度，> 30 字當紅旗（疑似抄原文） |

### TC-03 章節撰寫

| 維度 | 自動 / 人工 | 規則 |
|------|------------|------|
| 字數合規（800~1200） | 自動 | 字數計算 |
| 不污染輸出 | 自動 | 偵測 `Author's note`、`摘要：`、`(注：`、`<|im_end|>` 等 |
| 角色屬性貼合 / 風格 / 視角 / 銜接 / 完整 | 人工 | 語意 |

### TC-04 指令與格式遵循

| 子測 | 維度 | 自動 |
|------|------|------|
| 4-1 | 純 JSON 可解析 | `JSON.parse(text.trim())` 是否成功；字段檢查 |
| 4-1 | 欄位正確 | `wordCount` 為 number、`characters` 為 string[] 含「蘇晴」「林書言」、`mood` 為 string |
| 4-2 | 純文字無雜訊 | 不含「以下是」「希望」「```」「\""`」開頭 |
| 4-2 | 改寫有效 | 與輸入字串非完全相同 |
| 4-2 | 字數合規 | 與原文字數誤差 ±30% |
| 4-3 | 無 Author's note | 偵測常見附加標題 / 括號註 |

全部都能自動。TC-04 應該 100% 機器評分。

### TC-05 Token 上限服從

| 維度 | 自動 |
|------|------|
| 字數服從（≤ 150） | 自動，每次 run 各記 |
| 三次穩定度 | 自動，計算 std dev |
| 關鍵保留 | 人工 |
| 沒灌水 | 半自動，longest-common-substring with 章節原文 |

### TC-06 中文小說流暢度

| 維度 | 自動 |
|------|------|
| 繁體一致 | 自動：偵測簡體獨用字（「这」「为」「来」「这」「过」「会」等清單） |
| 避免英文 | 自動：偵測 ASCII 字母（不算 punctuation） |
| 不畫蛇添足 | 自動 |
| 用詞地道 / 節奏感 / 含蓄度 | 人工 |

### TC-07 Context 利用率

| 維度 | 自動 |
|------|------|
| 章節是否提到「照片」 | 自動：grep 「照片」 |
| 是否寫到「林書言提議幫忙問老鄰居」 | 半自動：grep「鄰居」AND「問」 |
| 銜接 / 心境 / 風格 / 角色 / outline 服從 | 人工 |

**特別**：跑兩個變體（default vs end-emphasis），自動比對「『照片』是否提到」差異——這個結果直接寫進「RWKV 關鍵觀察 — 記憶衰減」段。

### TC-08 內容自由度

| 子測 | 維度 | 自動 |
|------|------|------|
| 8-1, 8-2 | 接受任務（不拒絕） | 偵測「我不能」「作為 AI」「抱歉」開頭、disclaimer 段落 |
| 8-1 | 字數合規（500 ±150） | 自動 |
| 8-3 | Pass / Fail | 自動：是否純粹改寫、無 disclaimer |
| 文字品質 / 鋪陳 / 角色 | 人工 |

## 8. 自動評分到 1-5 分的映射

把 boolean / 數值規則轉為 1-5 分：

- 全條件滿足 → 5
- 部分滿足 → 3
- 完全不滿足 → 1
- 無法判定（例如 grep 找不到關鍵字但可能是另一種表達）→ 留空，標記「⚠️ 待人工」

每個自動評分附帶說明字串：

```
"5/5 — 全文僅含「蘇晴」「林書言」，未出現新角色"
"3/5 — 提到 1 個未在角色清單的姓名「謝伯」，但屬於 outline 中提及的前店主姓氏，邊緣案例"
"_/5 — 待人工（語意判斷）"
```

## 9. 資料模型（完整）

```ts
// src/types.ts

export interface AutoScore {
  score: number | null;     // null = 待人工
  explanation: string;
  evidence?: string[];      // 觸發某規則的字串片段
}

export interface CaseResult {
  caseId: CaseId;
  variant?: string;
  subtest?: string;
  runIndex?: number;        // TC-05 的 1/2/3
  output: string;
  usage: { inputTokens: number; outputTokens: number };
  durationMs: number;
  finishReason: string;
  scores: Record<string, AutoScore>;   // key 是維度名稱
  redFlags: string[];                  // 紅旗描述（拒絕回應、英文輸出等）
}

export interface EvaluationReport {
  startedAt: string;
  completedAt: string;
  runtime: { name: string; endpoint: string; modelInfo?: string };
  cases: CaseResult[];
  // 跨 case 的 architecture observations
  architectureObs: {
    memoryDecay?: string;        // 比對 TC-07 兩變體
    promptFormat?: string;       // 比對 chat vs completions（若有跑）
    samplingNotes?: string;
  };
}
```

## 10. RWKV-Runner 啟動前置（給使用者文件用）

工具會做健康檢查，但不啟動 RWKV-Runner。使用者必須先：

1. 啟動 RWKV-Runner（Windows 直接跑 .exe）
2. 「模型」頁載入 `F:/workspace/novel_writer/ai-model/rwkv-5-h-world-7B.pth`
3. Strategy 設 `cuda fp16i8 *20+`（依使用者顯卡）
4. 點「Run」等綠燈
5. 確認 `http://localhost:27777/v1/models` 回 200

工具偵測到不可達時印：

```
✗ RWKV-Runner 未回應於 http://localhost:27777
  請先啟動 RWKV-Runner，於「模型」頁載入 rwkv-5-h-world-7B.pth，並點 Run。
  詳見 docs/architecture/model-evaluation/runtimes/rwkv-runner.md
```

## 11. 實作里程碑

每個 milestone 結束都該能 `pnpm test` 通過。

### M1：基礎骨架（半天）

- `tools/eval/` 目錄、package.json、tsconfig
- 安裝 deps（commander、zod、gray-matter、vitest）
- `cli.ts` 印 `--help`
- `runtime.ts` interface
- `rwkv-runner.ts` 實作 `health()` 與最小 `chat()`
- 測試：mock fetch 跑 health、chat 一次

驗收：`pnpm dev --target rwkv-runner --dry-run` 顯示「會打給 http://localhost:27777」

### M2：解析 + 跑通一個 case end-to-end（半天）

- `parsers/test-case-parser.ts` 解 `tc-04-format-compliance.md` 的子測 4-1
- `runner/case-runner.ts` 跑單一 case
- `scoring/rules/json-validity.ts` 評 4-1
- `cli.ts` `--only TC-04` 跑通：實際對 RWKV-Runner 呼叫，印出 raw output 與是否 JSON 可解析

驗收：能對著實際啟動的 RWKV-Runner 跑出第一個 case

### M3：全部 8 個 case 都能跑（1 天）

- 補完 TC-01~03、05~08 的 case mapper（注意 TC-05 rerun 3、TC-07 變體、TC-08 子測）
- `orchestrator.ts` 串起全套
- 進度顯示（ora spinner）

驗收：`pnpm dev` 跑完 8 個 case 不爆炸；輸出一份 JSON 報表（先不寫回 markdown）

### M4：自動評分模組完整（1 天）

- `scoring/rules/*` 全部規則
- `scoring/scorer.ts` dispatch
- 每個 case 的維度都產出 `AutoScore | null`
- vitest 對每條規則寫單元測試（fixtures 在 `test/fixtures/`）

驗收：`pnpm test` 全綠；JSON 報表中每個維度都有 score 或 null

### M5：寫回 result markdown（半天）

- `parsers/result-template.ts` 找到每個 case 的「輸出片段」與評分表格位置
- `reporting/report-writer.ts` 合併
- 主觀維度保留 `_/5`，自動維度填上分數與說明
- TC-07 兩變體比對結果寫到「RWKV 關鍵觀察」段
- TC-05 三次字數與 std dev 寫進對應表

驗收：對著 result template 跑完，產出可讀的填好版本

### M6（optional）：跑 Qwen 也能用

- 抽 RWKV-specific 的東西到 config（採樣 profile、prompt format）
- `lm-studio.ts` runtime（其實就是換 endpoint 與 sampling）
- 跑 `--target lm-studio --result results/2026-05-10-qwen3.5-35b-a3b-iq4xs.md`

## 12. 測試策略

### 工具自身的測試

對 vitest 寫：

- **parsers**：餵假 markdown 測 happy path + 邊界（缺欄位、語法錯）
- **scoring/rules**：每條規則餵假輸出測 pass / fail / null（待人工）
- **runtimes**：mock global fetch 測 RWKV client 的 request body 結構與錯誤處理
- **case-runner**：mock runtime 測「跑一個 case → 收集評分」的整合
- **report-writer**：snapshot test，餵假 EvaluationReport + 假 template，比對輸出 markdown

### Fixtures

`test/fixtures/`：

- `tc-04-output-good.txt` — 正確 JSON 輸出
- `tc-04-output-bad.txt` — 帶 markdown fence 的 JSON
- `tc-06-traditional.txt` — 全繁體
- `tc-06-mixed.txt` — 簡繁混
- `tc-08-refused.txt` — 拒絕回應（當紅旗）
- 等等

每個 fixture 對應一兩條 rules 的測試。

### 整合測試（手動）

跑通 RWKV-Runner（M2 / M3 / M5），這部分自動化困難（需要實際模型），手動驗證 + 截圖即可。

## 13. 已知風險與緩解

| 風險 | 影響 | 緩解 |
|------|------|------|
| RWKV-Runner OAI 端點對 system role 處理不一致 | 影響所有 case | M2 用最簡 prompt 試；若有問題切 `/v1/completions` 端點 + 自組 prompt |
| 模型輸出含中文，Markdown 寫回時編碼 / 縮排破壞 result template | 報表輸出損毀 | report-writer 用 snapshot test；輸出後跑 `markdown-link-check` |
| TC-03 / TC-07 上下文太長，模型 OOM 或 chunk 超時 | 部分 case 跑不完 | client 設 timeout 90s；OOM 時降 `length per chunk` 在 RWKV-Runner UI |
| 自動評分規則太嚴或太鬆 | 評分失真 | 每條規則寫測試；M4 完成後人工抽樣 2-3 個 case 對照人工判定 |
| 多次 rerun（TC-05）時 RWKV state 殘留 | 後續 run 受前面影響 | OAI API 是 stateless（每 request 獨立），實測確認；若有問題改用 `/v1/completions` |
| 解析 markdown 時對某 case 結構假設崩 | parser 出錯 | case mapper 個別寫，不通用化；增加 schema validation |

## 14. 與專案既有資產的關係

- 工具讀：`docs/architecture/model-evaluation/test-cases/*.md`
- 工具寫：`docs/architecture/model-evaluation/results/*.md`
- 工具尊重：`docs/architecture/model-evaluation/runtimes/rwkv-runner.md`（採樣與注意事項）
- 工具不依賴：`packages/llm-adapter`（尚未實作）—— 但**介面相容性目標**：若日後 llm-adapter 寫好，本工具的 `Runtime` interface 應能被 `LLMProvider` 替代
- 工具不影響：`apps/`、`docs/architecture/specs/` 中的設計

## 15. 給下個 session 的 step-by-step 起手式

```bash
# 1. 確認專案根
cd F:/workspace/novel_writer

# 2. 建立 tools/eval 並初始化
mkdir -p tools/eval/src tools/eval/test
cd tools/eval

# 3. pnpm init 並設定為 ESM、private
pnpm init
# 編輯 package.json：
#   "type": "module",
#   "private": true,
#   "scripts": { "dev": "tsx src/cli.ts", "test": "vitest", "build": "tsc" }

# 4. 安裝依賴
pnpm add commander zod gray-matter consola ora cli-progress
pnpm add -D typescript tsx vitest @types/node

# 5. tsconfig.json
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
EOF

# 6. 動工
# 從 M1 開始：runtime interface + rwkv-runner client + cli skeleton + 健康檢查
```

**動工順序（M1 內部）：**

1. 寫 `src/types.ts`（先補 Runtime / ChatRequest / ChatResponse）
2. 寫 `src/runtimes/runtime.ts`（純 interface）
3. 寫 `src/runtimes/rwkv-runner.ts`（含 health + chat）
4. 寫 `src/cli.ts`（commander，先只支援 `--health`）
5. 寫 `test/runtimes/rwkv-runner.test.ts`（mock fetch）
6. `pnpm test` 通過

驗收 M1：

```bash
pnpm dev --health
# 預期：✓ RWKV-Runner 回應正常於 http://localhost:27777，模型 info: ...
# 或：✗ RWKV-Runner 未回應...
```

## 16. 不確定的決定（給實作者注意，必要時退回確認）

- **採樣參數放在哪**：目前計劃放在 `eval.config.ts` 的常數，CLI flag 可覆寫。如果使用者希望 per-runtime config 檔（例如 `eval.config.rwkv-runner.ts`），可開檔分離
- **result markdown 寫回時的衝突處理**：使用者可能在 result template 中已經填了一些欄位。寫回邏輯預設**不覆寫使用者已填**——只填 `_` / `<貼這裡>` 這類 placeholder。若衝突應印 warn
- **是否支援 `/v1/completions`（非 chat）端點**：M3 預設不需要。若 M2 跑 chat 端點時 RWKV 表現差到不能用（指令完全沒守），切 completions 端點。這個 fallback 留 M6
- **token 計數**：M4 自動評分中「字數」用中文字數（`text.replace(/\s/g, '').length` 不夠精確，要排除標點）。寫一個 `countChineseChars()` helper

## 17. 完成定義（DoD）

- [ ] M1~M5 全部通過驗收
- [ ] `tools/eval/README.md` 寫好使用說明
- [ ] 實際跑一次 `pnpm dev --result docs/architecture/model-evaluation/results/2026-05-10-rwkv-5-h-world.md` 對 RWKV-5-h-world-7B 跑完 8 個 case
- [ ] 該 result 檔被填好（自動部分）
- [ ] 工具自身單元測試 ≥ 60% line coverage
- [ ] `tools/eval/PLAN.md` 軟連結或複製本檔，方便後續調整
- [ ] 在主 `README.md` 加一行指向 `tools/eval/README.md`

## 18. 後續擴充（不在本次範圍）

- LM Studio runtime（M6）
- Ollama runtime
- LLM-as-judge（用 Claude 雲端評語意性維度）
- 多模型 side-by-side report（合併數個 result 檔產生比較表）
- CI 整合：每次 LLM adapter / prompt-library 改動跑 regression
- 生成 `docs/agents/<name>.md` 中「模型建議」段的程式（讀最新 result 檔自動更新）

## 變更紀錄

- `2026-05-10`：初版計劃定稿
- `2026-05-10`：M1~M6 實作完成（`tools/eval/`），100 個單元測試通過，line coverage 89%
