# Git 版控指南

Novel Writer 把你的每一次儲存都記錄成 git commit，讓你可以隨時回到任何版本。

## 自動 commit 時機

| 動作 | commit 訊息 |
|---|---|
| 儲存章節 | `chapter: save chapter N 標題` |
| 採用 AI 草稿 | `chapter: adopt AI draft for chapter N 標題` |
| status 自動更新 | `status: update after adopt/save chapter N` |
| 新增角色 | `character: create 角色名` |
| 編輯角色 | `character: edit 角色名` |

## 歷史面板使用

1. 在章節編輯器點工具列「歷史」
2. Drawer 從右側滑出，顯示該章節的所有 commit
3. 點 commit → 右側預覽當時內容
4. 點「Diff」→ 紅綠差異顯示
5. 點「還原到此版本」→ 確認 → 回到那個版本（會建立新的 revert commit）

## 命令列 git 互動

Novel Writer 的小說資料夾本身就是一個 git repo，可以直接用 git 命令操作：

```bash
cd 你的小說資料夾

# 看所有 commit
git log --oneline

# 看某章節的歷史
git log --oneline -- chapters/chapter_0001_梅雨初晴.md

# 查看某個 commit 的內容
git show abc1234:chapters/chapter_0001_梅雨初晴.md

# 手動回到某個版本
git checkout abc1234 -- chapters/chapter_0001_梅雨初晴.md
git commit -m "chapter: manual revert"
```

## Drive 同步與 git 衝突

若你用 Google Drive / iCloud 同步小說資料夾，偶爾可能出現衝突：

1. **啟動時警告「Drive 同步帶來變更」**：點「查看詳情」確認後，若內容正確可直接 commit
2. **編輯器提示 mtime 不符**：Drive 改了 .md 但不在 app 內；選「以伺服器版本繼續」或「保留本地草稿」

最佳實踐：**用 app 開啟後再讓 Drive 同步**，避免同時寫入衝突。
