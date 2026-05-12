# BDD Features

PM 寫的可執行 BDD 規格。每個 user story 對應一份 `.feature` 檔，採 Gherkin 語法。

## 結構

```
features/
├── README.md
└── <NNN>-<slug>.feature   # 與 docs/requirements/stories/<NNN>-... 一一對應
```

## 規則

1. **PM 寫 .feature**，QA 寫 step definitions（將來放在 `apps/api/tests/steps/` 與 `apps/web/tests/steps/`）
2. `.feature` 中的 Scenario 名稱與內容必須與 story markdown 中的 Gherkin 區塊**逐字一致**
3. 一處改動兩處同步——不要讓兩份漂移
4. 中文 Scenario 內容 + 英文關鍵字（`Feature` / `Scenario` / `Given` / `When` / `Then` / `And`）

## 為何分兩處

- markdown：人讀的脈絡（背景、範圍、UX 注意事項）
- .feature：機器跑的測試規格

兩者共用 Scenario 文字，但承載不同任務。
