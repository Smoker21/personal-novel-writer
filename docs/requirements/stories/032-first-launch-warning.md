# 首次啟動警語

> Story ID: `032-first-launch-warning`
> Persona: `hobbyist-author`、`serial-author`、`worldbuilder-author`
> Epic: `EPIC-08-app-foundation`
> Priority: `P0`
> Size: `S`
> Status: `Ready`
> Depends on: `009`（警語「不再顯示」狀態存在 settings.yaml）

## 使用者故事

身為 **個人創作者**，
我想要 **第一次啟動應用時看到一份簡短的說明，告知這是個人本機工具、內容自由度、隱私責任，看過勾「不再顯示」之後永遠不再打擾**，
以便 **我知道自己在用什麼工具、它做什麼不做什麼，又不會每次開啟都被同一個 modal 擋住**。

## 背景與動機

依 [PM 釐清 Q1](../../architecture/adr/0001-storage-strategy.md)：使用者明示「**首次啟動時顯示警語，日後都不顯示**」。這是個人工具，不做完整年齡驗證流程，但**首次警語**仍是法律與心智契約上必要的一步。

警語的存在目的有三個：

1. **產品定位告知**：這是「個人本機」工具，內容不上廠商伺服器（雲端 LLM 例外）
2. **內容自由度免責**：使用者可寫成人 / 暴力 / 政治敏感內容，責任自負；本應用不審查、不舉報
3. **隱私聲明**：應用不收集任何 telemetry / 使用統計；API key 與內容只存使用者本機

## 範圍

**包含：**
- 首次啟動偵測（`~/.novel-writer/settings.yaml` 不存在 OR 該檔的 `meta.firstLaunchWarningAcknowledged: false`）
- 顯示警語對話框 modal（不可被點外面關掉）
- 警語內容（見「警語內容」段）
- 「我已了解，不再顯示」按鈕 → 寫入 `settings.yaml`：`meta.firstLaunchWarningAcknowledged: true` + 時間戳
- 「離開應用」按鈕 → 關閉 Tauri 視窗
- 警語對話框關閉後正常進入應用首頁
- 使用者重置設定（`reset` 命令或刪 settings.yaml）→ 下次啟動再次顯示

**不包含：**
- 年齡驗證 / Captcha / 雙重確認
- 多語言（純繁中）
- 警語版本管理（v0.1 警語內容更新後再次顯示）→ 留 P1
- 服務條款 / 隱私權政策 PDF 連結 → 純文字描述，不外連
- 「為何要看這個警語？」說明連結 → MVP 不需

## 警語內容

```
歡迎使用 Novel Writer

這是一個個人本機小說寫作工具，請注意以下幾點：

📁 本機優先
你的小說內容只存在你的電腦。應用不收集任何 telemetry、不上傳分析、不蒐集統計。
如果你選擇接續到雲端 LLM（Anthropic / OpenAI / Gemini / xAI），對應廠商會看到你
傳給它們的章節片段；地端模型（Ollama / LM Studio / RWKV-Runner）則完全離線。

📝 內容自由
你可以寫任何類型的小說，包括成人、暴力、政治敏感題材。應用不審查、不舉報、
不過濾。但雲端 LLM 廠商可能拒絕特定內容；遇到時請改用地端模型。

🔐 隱私責任
API key 與內容只存在你選擇的目錄與 ~/.novel-writer/。你自己控制備份（建議
使用 Google Drive / iCloud / OneDrive 同步小說目錄）。請勿把 API key 同步到
雲端硬碟。

📂 git 版控
每個小說專案會自動初始化為 git repo。你可以隨時用 git log / git checkout 還
原任何版本。你需要先安裝 git。

按下「我已了解，不再顯示」表示你接受以上條款，且本警語不再出現。
```

## 驗收條件 (Gherkin)

### Scenario: 首次啟動顯示警語
```gherkin
Given ~/.novel-writer/settings.yaml 不存在
When 我啟動應用
Then 應用顯示警語對話框
And 對話框置中、modal（背景變灰、不可點外）
And 對話框含 4 個區塊（📁 本機優先、📝 內容自由、🔐 隱私責任、📂 git 版控）
And 對話框底部有兩個按鈕：「離開應用」與「我已了解，不再顯示」
```

### Scenario: 按「我已了解」後永久不再顯示
```gherkin
Given 警語對話框顯示中
When 我按「我已了解，不再顯示」
Then ~/.novel-writer/settings.yaml 被建立（或更新）
And settings.yaml 包含 `meta.firstLaunchWarningAcknowledged: true`
And settings.yaml 包含 `meta.firstLaunchWarningAcknowledgedAt: <ISO 8601 時間戳>`
And 對話框關閉
And 應用進入首頁
When 我關閉應用並重新啟動
Then 警語對話框**不**再顯示
And 應用直接進入首頁
```

### Scenario: 按「離開應用」關閉視窗
```gherkin
Given 警語對話框顯示中
When 我按「離開應用」
Then Tauri 視窗關閉
And settings.yaml **不**被建立
And 下次啟動時警語仍會顯示
```

### Scenario: 使用者重置設定後再次顯示
```gherkin
Given 我已看過警語並點過「不再顯示」
When 我手動刪除 ~/.novel-writer/settings.yaml
And 重新啟動應用
Then 警語對話框再次顯示
```

### Scenario: settings.yaml 存在但 firstLaunchWarningAcknowledged 為 false
```gherkin
Given ~/.novel-writer/settings.yaml 存在（從 Story 009 設定頁建立）
And meta.firstLaunchWarningAcknowledged 為 false 或不存在
When 我啟動應用
Then 警語仍顯示
And 按「我已了解」會更新 firstLaunchWarningAcknowledged 為 true（保留 settings.yaml 其他欄位）
```

### Scenario: 不可點對話框外面關掉
```gherkin
Given 警語對話框顯示中
When 我點對話框外的背景區域
Then 對話框**不**關閉
And 必須明確按一個按鈕才能離開警語
```

### Scenario: 不可用 ESC 鍵跳過
```gherkin
Given 警語對話框顯示中
When 我按 ESC 鍵
Then 對話框**不**關閉
```

## AI 互動細節

不涉及 AI 代理。

## UX 注意事項

- 對話框寬度 600-700px，高度依內容自適應；超過視窗時可內部 scroll
- 警語文字用 prose font（與小說正文同字型，建立親切感）
- 4 個區塊用 emoji + 粗體標題，內文留白寬鬆，視覺不擁擠
- 「我已了解」按鈕用主色強調；「離開應用」用次要灰色
- 按鈕之間留足夠距離避免誤觸
- 對話框 fade-in 動畫（0.2 秒），避免突兀

## 開放問題

- [ ] 警語文字未來修訂時是否要再次顯示？建議：MVP 不做版本管理；P1 加 `warningVersion` 欄位，文字更新時 bump 版本，再次顯示
- [ ] 是否在底部加「[查看完整隱私聲明]」連結？建議：MVP 不做（純文字夠了）；P2 若加再寫 docs/privacy.md
- [ ] 警語語言是否需要英文版？建議：MVP 純繁中（與 personas 一致）
