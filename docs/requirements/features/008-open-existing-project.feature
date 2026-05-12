Feature: 開啟既有專案
  身為個人創作者
  我想要回到先前建立過的小說專案；可以從「最近開啟」清單一鍵打開，或瀏覽檔案系統選擇任意專案資料夾打開
  以便不必每次都要重新建立專案，且可以開啟手動移動 / 從 Drive 同步來的其他電腦的專案

  Scenario: 從「最近開啟」清單開啟專案
    Given 我曾經建立過專案「春日記事」位於 D:/GoogleDrive/MyNovels/春日記事
    And 該專案已在最近開啟清單中
    When 我在首頁的「最近開啟」清單點擊「春日記事」
    Then 系統載入該專案
    And 我被導向章節編輯器，預設開啟「最近編輯的章節」（首次開啟則是第一章）
    And 「最近開啟」清單中該項目的 lastOpenedAt 被更新為現在時間

  Scenario: 透過「瀏覽資料夾」開啟未列在清單中的專案
    Given 我從 Drive 同步下來了另一台電腦的專案「春日記事」位於 D:/GoogleDrive/MyNovels/春日記事
    And 該專案尚未在最近開啟清單中
    When 我在首頁點「瀏覽資料夾」
    And 選擇 D:/GoogleDrive/MyNovels/春日記事
    Then 系統驗證該資料夾有 project.yaml
    And 載入該專案並進入章節編輯器
    And 「最近開啟」清單新增該專案項目

  Scenario: 嘗試打開非合法的 novel-writer 資料夾
    Given 我在首頁點「瀏覽資料夾」
    When 我選擇一個沒有 project.yaml 的資料夾
    Then 系統顯示「此資料夾不是合法的 Novel Writer 專案（缺 project.yaml）」
    And 提供「在此資料夾建立新專案」連結 → 跳到 Story 001 流程，預設路徑為該資料夾
    And 不更新「最近開啟」清單

  Scenario: 最近開啟清單中的專案資料夾不見了
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

  Scenario: 從清單移除單筆（不刪資料夾）
    Given 「最近開啟」清單有 3 個專案
    When 我在某個項目右鍵選「從清單移除」
    And 在確認對話框點「確認（不刪除檔案）」
    Then 該項目從清單移除
    And 該專案的資料夾仍存在於檔案系統
    And 之後仍可用「瀏覽資料夾」重新開啟

  Scenario: 清空整個「最近開啟」清單
    Given 「最近開啟」清單有多筆
    When 我點「清空清單」
    And 在確認對話框點「確認」
    Then 所有項目從清單移除
    And 各專案資料夾本身不被刪除

  Scenario: 「最近開啟」上限為 10
    Given 「最近開啟」清單已有 10 個專案
    When 我透過「瀏覽資料夾」開啟一個新專案
    Then 新專案被加入清單頂部
    And 最舊的（lastOpenedAt 最早）那個自動移出清單

  Scenario: 開啟同步衝突的專案（git）
    Given 我在 A 電腦編輯過「春日記事」，Drive 已同步到 B 電腦
    And 我此時在 B 電腦打開該專案
    And B 電腦的 .git 顯示尚有 uncommit 的本地變更（從 A 電腦同步來的）
    When 我從清單點「春日記事」
    Then 系統載入專案
    And UI 提示「Drive 同步帶來了未 commit 的變更，建議檢視 git status 或手動觸發 commit」（→ Story 010 處理具體 UI）
    And 仍可正常編輯
