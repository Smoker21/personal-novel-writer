# 開啟既有專案

> Story ID: `008-open-existing-project`
> Persona: `hobbyist-author`、`serial-author`、`worldbuilder-author`
> Epic: `unassigned`
> Priority: `P0`
> Size: `S`
> Status: `Ready`
> Depends on: `001`（建立專案時加入「最近開啟」清單）

## 使用者故事

身為 **個人創作者**，
我想要 **回到先前建立過的小說專案；可以從「最近開啟」清單一鍵打開，或瀏覽檔案系統選擇任意專案資料夾打開**，
以便 **不必每次都要重新建立專案，且可以開啟手動移動 / 從 Drive 同步來的其他電腦的專案**。

## 背景與動機

Story 001 寫了「將此專案加入『最近開啟』清單」但**沒有定義怎麼從那個清單打開**。這條 gap 在 MVP 必補——否則使用者跑完 001 一次後關掉應用就回不來了。

兩種開啟入口：

1. **最近開啟清單**：列在首頁；點一下進專案
2. **瀏覽資料夾**：使用者手動指定資料夾（例：剛從 Drive 同步下來的別人的專案、自己另一台電腦的專案）

## 範圍

**包含：**
- 首頁顯示「最近開啟」清單（最多 10 個，依最近開啟時間排序）
- 每個項目顯示：書名、路徑（縮短顯示）、最近開啟時間、章節數
- 點擊一個項目 → 開啟該專案，跳到章節編輯器（預設第一章 / 最近編輯的章節）
- 「瀏覽資料夾」按鈕 → 開啟系統檔案選擇器 → 選資料夾 → 驗證 → 開啟
- 驗證資料夾是否為「合法的 novel-writer 專案」：必須有 `project.yaml`
- 把成功開啟的專案加入 / 更新「最近開啟」清單
- 「最近開啟」清單支援：移除單筆（不刪資料夾，只移出清單）、清空整個清單
- 開啟時若資料夾已不存在（例：被移走 / 重命名），標記為「無法定位」，並提供「移除此項」或「重新指定路徑」

**不包含：**
- 開啟非 novel-writer 格式的資料夾 → 顯示錯誤
- 匯入舊版格式專案 → 後續另開
- 多開（同時開兩個專案視窗）→ 後續優化
- 雲端 git remote clone 開啟 → Story 010 進階功能

## 「最近開啟」清單資料

存在 `~/.novel-writer/settings.yaml`：

```yaml
recentProjects:
  - hash: a1b2c3d4e5f6  # sha256(absolutePath) 前 12 字
    path: /Users/.../春日記事
    title: 春日記事
    lastOpenedAt: 2026-05-12T10:30:00Z
    chapterCount: 12
  - hash: ...
    path: D:/GoogleDrive/MyNovels/陳伯後宮傳
    title: 陳伯後宮傳
    lastOpenedAt: 2026-05-10T15:00:00Z
    chapterCount: 1
```

開啟動作會更新 `lastOpenedAt` 並（如有變動）`chapterCount`、`title`。

## 驗收條件 (Gherkin)

### Scenario: 從「最近開啟」清單開啟專案
```gherkin
Given 我曾經建立過專案「春日記事」位於 D:/GoogleDrive/MyNovels/春日記事
And 該專案已在最近開啟清單中
When 我在首頁的「最近開啟」清單點擊「春日記事」
Then 系統載入該專案
And 我被導向章節編輯器，預設開啟「最近編輯的章節」（首次開啟則是第一章）
And 「最近開啟」清單中該項目的 lastOpenedAt 被更新為現在時間
```

### Scenario: 透過「瀏覽資料夾」開啟未列在清單中的專案
```gherkin
Given 我從 Drive 同步下來了另一台電腦的專案「春日記事」位於 D:/GoogleDrive/MyNovels/春日記事
And 該專案尚未在最近開啟清單中
When 我在首頁點「瀏覽資料夾」
And 選擇 D:/GoogleDrive/MyNovels/春日記事
Then 系統驗證該資料夾有 project.yaml
And 載入該專案並進入章節編輯器
And 「最近開啟」清單新增該專案項目
```

### Scenario: 嘗試打開非合法的 novel-writer 資料夾
```gherkin
Given 我在首頁點「瀏覽資料夾」
When 我選擇一個沒有 project.yaml 的資料夾
Then 系統顯示「此資料夾不是合法的 Novel Writer 專案（缺 project.yaml）」
And 提供「在此資料夾建立新專案」連結 → 跳到 Story 001 流程，預設路徑為該資料夾
And 不更新「最近開啟」清單
```

### Scenario: 最近開啟清單中的專案資料夾不見了
```gherkin
Given 「最近開啟」清單中有「春日記事」，路徑為 D:/GoogleDrive/MyNovels/春日記事
And 該資料夾已被使用者手動移走或重命名
When 我在清單中點擊「春日記事」
Then 系統嘗試載入該路徑失敗
And 該項目被標記為「無法定位（路徑不存在）」灰底顯示
And 出現選項：「移除此項」/「重新指定路徑」/「取消」
When 我點「重新指定路徑」並選新位置
Then 系統驗證新路徑有 project.yaml
And 清單更新為新路徑
And 開啟該專案
```

### Scenario: 從清單移除單筆（不刪資料夾）
```gherkin
Given 「最近開啟」清單有 3 個專案
When 我在某個項目右鍵選「從清單移除」
And 在確認對話框點「確認（不刪除檔案）」
Then 該項目從清單移除
And 該專案的資料夾仍存在於檔案系統
And 之後仍可用「瀏覽資料夾」重新開啟
```

### Scenario: 清空整個「最近開啟」清單
```gherkin
Given 「最近開啟」清單有多筆
When 我點「清空清單」
And 在確認對話框點「確認」
Then 所有項目從清單移除
And 各專案資料夾本身不被刪除
```

### Scenario: 「最近開啟」上限為 10
```gherkin
Given 「最近開啟」清單已有 10 個專案
When 我透過「瀏覽資料夾」開啟一個新專案
Then 新專案被加入清單頂部
And 最舊的（lastOpenedAt 最早）那個自動移出清單
```

### Scenario: 開啟同步衝突的專案（git）
```gherkin
Given 我在 A 電腦編輯過「春日記事」，Drive 已同步到 B 電腦
And 我此時在 B 電腦打開該專案
And B 電腦的 .git 顯示尚有 uncommit 的本地變更（從 A 電腦同步來的）
When 我從清單點「春日記事」
Then 系統載入專案
And UI 提示「Drive 同步帶來了未 commit 的變更，建議檢視 git status 或手動觸發 commit」（→ Story 010 處理具體 UI）
And 仍可正常編輯
```

## AI 互動細節

不涉及 AI 代理。

## UX 注意事項

- 首頁上半部「新小說」按鈕（→ 001），下半部「最近開啟」清單
- 清單項目用卡片式樣（書名 + 路徑 tooltip + 章節數 + 上次開啟時間）
- 「瀏覽資料夾」按鈕在清單下方
- 「無法定位」的項目灰底 + ⚠️ 圖示，hover 顯示「路徑：X，已不存在」
- 一鍵開啟，無中間 modal（除非有同步衝突等異常）
- 首次安裝沒有任何專案時，清單區顯示「還沒有專案。點上面『新小說』開始你的第一本！」

## 開放問題

- [ ] 「最近開啟」清單顯示章節數需要每次更新時讀 chapters/ 數一下 — 是否在 settings.yaml cache 一個快照？建議：是，每次開啟時更新；避免每次 render 首頁都掃資料夾
- [ ] 雲端 git remote clone 開啟（從 GitHub URL 開）→ 未來功能，本 MVP 不做；Story 010 進階段可加
- [ ] 開啟一個被改名過的資料夾要不要自動更新 settings.yaml 的 title？建議：是，讀 project.yaml 的 title 為準
