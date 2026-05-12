# 模型能力評估

## 為何要做

[ADR-0004](../adr/0004-llm-adapter.md) 規定每個 Agent / Skill 規格必須標「雲端首選 / 地端最小可行」。但「最小可行」是否可行——例如某模型能不能勝任 chapter-writer——必須有實證才能下結論，不能憑感覺。

本資料夾用一致的 test case 對候選模型做評估，產出可比較的記分表（scorecard），作為 `docs/agents/<name>.md` 中模型建議的實證依據。

## 結構

```
model-evaluation/
├── README.md                # 本檔
├── _scorecard.md            # 評分表模板
├── test-cases/              # 8 個跨 Agent 共用的測試案例
│   ├── tc-01-character-consistency.md
│   ├── tc-02-status-extraction.md
│   ├── tc-03-chapter-writing.md
│   ├── tc-04-format-compliance.md
│   ├── tc-05-token-budget.md
│   ├── tc-06-chinese-fluency.md
│   ├── tc-07-context-utilization.md
│   └── tc-08-content-freedom.md
└── results/                 # 各模型的評估結果，一檔一模型
    └── YYYY-MM-DD-<model-slug>.md
```

## 評估流程

1. **準備執行環境**（見下節）
2. 開新結果檔：`results/<日期>-<model-slug>.md`，套 `_scorecard.md` 模板
3. 對每個 test case：
   - 把該 case 的 system prompt + user prompt 餵給模型
   - 記錄輸出與用時
   - 依 case 中列的「評分維度」打 1-5 分並寫評語
4. 最後給綜合建議：此模型適合哪些 Agent / Skill / 不適合哪些
5. 在對應的 `docs/agents/<name>.md` 或 `docs/skills/<name>.md` 中引用此結果

## 執行環境建議

候選模型可能以 GGUF（Transformer 系）或 .pth / .st（RWKV 系）格式發佈，runtime 因此而異：

| 工具 | 適用模型格式 | 推薦場景 | 詳細指南 |
|------|-------------|---------|---------|
| **LM Studio** | GGUF | 手動評估（Transformer 預設） | TBA |
| **Ollama** | GGUF | 自動化測試 | TBA |
| **llama.cpp server** | GGUF | 進階 / 客製化 | TBA |
| **RWKV-Runner** | .pth / .st | RWKV 系列 | [runtimes/rwkv-runner.md](./runtimes/rwkv-runner.md) |

**重要**：採樣預設、prompt format、長 context 行為在不同架構下差異極大。跑 RWKV 模型前**必看** RWKV-Runner 指南，否則會誤判為「指令遵循差」（其實是採樣設定錯）。

評估設定：

- **Temperature**: 0.7（小說創作預設）；指令遵循 / JSON 類測試降到 0.2
- **Top-p**: 0.9
- **Max tokens**: 視 case 而定（章節撰寫 2048+，狀態提煉 512）
- **System prompt**: 使用 case 提供的，不調整
- **重複懲罰**: 預設值

## 跨架構注意

不同 LLM 架構（Transformer vs RNN）對相同 test case 的弱項不同。評估時請**主動觀察**架構特有現象：

| 架構 | 主要弱項 | 對 test case 的影響 |
|------|---------|------------------|
| Transformer（Qwen / Llama / Gemma） | 高 ctx 時 attention 稀釋；KV cache 巨大 | TC-07 在 32k ctx 邊緣可能 attention 崩 |
| RNN（RWKV） | 線性壓縮過去 → **記憶衰減**；對 prompt format 敏感 | TC-07 中遠處的關鍵指令易被遺忘；建議把重點放在 user prompt 末尾 |
| MoE（Mixtral / Qwen-MoE） | 路由分歧 → 語氣不穩 | TC-06 中文流暢度上跨段落風格可能跳 |

每個 result 檔有「Architecture-specific observations」區塊用來記錄這些觀察。

## 評分維度（共通）

每個 test case 自帶一組 1-5 分維度，但下列為跨 case 通用：

| 分數 | 含義 |
|------|------|
| 5 | 完全達標，零缺陷 |
| 4 | 達標，瑕不掩瑜（小錯不影響使用） |
| 3 | 勉強可用，需要二次提示或人工修補 |
| 2 | 不可用，但有改善空間（提示詞工程或微調可救） |
| 1 | 完全不能用 / 模型對此任務無能力 |

加總後每個 test case 落在「合格 / 邊緣 / 不合格」三檔，最終決定該模型對應哪些 Agent。

## 引用約定

評估結果是**特定時間點**的快照。模型 weights 不變、提示詞不變、runtime 設定不變才有可比性。在 `docs/agents/<name>.md` 引用時，路徑 + 日期都要寫死：

```markdown
## 模型建議

- 雲端首選：anthropic:claude-sonnet-4-6
- 地端：lmstudio:qwen3.5-35b-a3b-uncensored-iq4xs
  （依 [evaluation 2026-05-10](../architecture/model-evaluation/results/2026-05-10-qwen3.5-35b-a3b-iq4xs.md) TC-01/02/03 均 ≥ 4 分）
```
