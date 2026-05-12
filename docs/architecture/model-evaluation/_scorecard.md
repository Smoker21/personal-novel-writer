# 模型評估結果：<model display name>

> 結果檔案命名：`YYYY-MM-DD-<model-slug>.md`
> 在 `docs/agents/<name>.md` 引用本檔請帶上日期。

## 模型 metadata

| 欄位 | 值 |
|------|------|
| 顯示名稱 | <e.g. Qwen3.5-35B-A3B Uncensored Aggressive (IQ4_XS)> |
| Provider 形式 | local / cloud |
| Model ID（在 settings.yaml 的寫法） | `lmstudio:<file>` 或 `ollama:<tag>` |
| 來源 | <HF URL / vendor 頁面> |
| 量化 | <e.g. IQ4_XS> |
| 檔案大小 | <GB> |
| 架構 | <dense / MoE; total / active params> |
| Context window | <tokens> |
| 訓練語料偏向 | <英文 / 中文 / 多語> |
| 出貨日期 | <YYYY-MM> |

## 執行環境

| 欄位 | 值 |
|------|------|
| Runtime | LM Studio / Ollama / llama.cpp |
| 版本 | <runtime version> |
| 硬體 | CPU / GPU 型號、VRAM、RAM |
| 載入 layers | <n / total> |
| 量測時的 ctx-size | <tokens> |
| 觀測 token/s | <generation tps> |

## 預設提示參數

| 欄位 | 值 |
|------|------|
| Temperature | 0.7（除非該 case 另指定） |
| Top-p | 0.9 |
| Max tokens | 視 case |
| System prompt | 來自 test case |

## 評分總表

| Test Case | 維度小計 | 通過 | 備註 |
|-----------|---------|------|------|
| TC-01 角色一致性 | _/_ | ⬜ | |
| TC-02 狀態提煉 | _/_ | ⬜ | |
| TC-03 章節撰寫 | _/_ | ⬜ | |
| TC-04 指令與格式遵循 | _/_ | ⬜ | |
| TC-05 Token 上限服從 | _/_ | ⬜ | |
| TC-06 中文小說流暢度 | _/_ | ⬜ | |
| TC-07 Context 利用率 | _/_ | ⬜ | |
| TC-08 內容自由度 | _/_ | ⬜ | |

通過判定：每個 case 內各維度均 ≥ 3。

## 各 case 詳評

### TC-01 角色一致性

- 輸入提示詞 (完整列出)

- 輸出內容（完整列出）：

  > <貼模型輸出>

- 評分：

  | 維度 | 分數 | 說明 |
  |------|------|------|
  | 不新增未提供角色 | _/5 | |
  | 不修改既有角色名 | _/5 | |
  | 角色屬性貼合卡片 | _/5 | |

- 觀察：<列出具體優點 / 缺陷>

### TC-02 狀態提煉

[同上格式]

### TC-03 章節撰寫

[同上格式]

### TC-04 指令與格式遵循

[同上格式]

### TC-05 Token 上限服從

[同上格式]

### TC-06 中文小說流暢度

[同上格式]

### TC-07 Context 利用率

[同上格式]

### TC-08 內容自由度

[同上格式]

## Architecture-specific observations

> 不同架構（Transformer / RNN / MoE）有不同弱項，這裡記錄該模型架構特有的觀察。

- **架構類別**：<Transformer dense / Transformer MoE / RNN / 其他>
- **長 context 行為**：（Transformer：attention 稀釋徵兆？；RNN：是否觀察到記憶衰減？指令放開頭 vs 末尾差異？）
- **Prompt format 敏感度**：（要不要在 system / user prompt 加特定 framing？換 chat 端點 vs completion 端點差異？）
- **採樣參數對品質的影響**：（temperature / top-p / penalty 改一階差很多嗎？）
- **MoE 特有**（若適用）：跨段落語氣穩定嗎？路由可見的偏向？
- **與相同尺寸的其他架構比較**：（若曾跑過同 size 的對照組）

## 綜合建議

### 適用的 Agent / Skill

- ✅ <Agent name>：<理由>
- ⚠️ <Agent name>：可用但須附 retry / 提示詞工程
- ❌ <Agent name>：不建議

### 對應到 settings.yaml

```yaml
defaults:
  routing:
    primary: <雲端 model>     # 此本機模型作為哪個 Agent 的 fallback
    fallbacks:
      - <此模型 id>
```

### 已知的提示詞工程注意事項

- <例：必須在 system prompt 末加「不要解釋，只輸出結果」>
- <例：JSON 輸出要在 user prompt 加 ```json 圍欄>

### 重新評估觸發條件

- 模型升版
- runtime 升版（LM Studio 出新 sampler）
- 量化版本變更（從 IQ4_XS 換成 Q4_K_M）
- 對應 spec 的 Agent 提示詞重大調整

## 變更紀錄

- `YYYY-MM-DD`: 初版
