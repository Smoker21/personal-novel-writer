# 安裝指南

## 系統需求

- **git 2.30.0+**（必要）
- **作業系統**：Windows 10/11、macOS 12+、Ubuntu 22.04+

---

## Windows

1. 從 [Releases](https://github.com/Smoker21/personal-novel-writer/releases) 下載 `novel-writer_0.1.0_x64-setup.exe`
2. 執行安裝程式
3. **SmartScreen 警告**（預期出現，因無 EV cert）：
   - 點「更多資訊」
   - 點「仍要執行」
4. 安裝 git（若未安裝）：https://git-scm.com/download/win

---

## macOS

1. 下載 `novel-writer_0.1.0_aarch64.dmg`（Apple Silicon）或 `x64.dmg`（Intel）
2. 拖到 Applications
3. **Gatekeeper 警告**（因無 Apple Developer 帳號簽署）：
   - 系統設定 → 隱私權與安全性
   - 找到「novel-writer 已被封鎖」→ 點「仍要開啟」
   - 或在 Terminal 執行：`xattr -cr /Applications/novel-writer.app`
4. 安裝 git：`xcode-select --install`

---

## Linux

1. 下載 `novel-writer_0.1.0_amd64.AppImage`
2. 賦予執行權限：
   ```bash
   chmod +x novel-writer_*.AppImage
   ./novel-writer_*.AppImage
   ```
3. 安裝 git：
   ```bash
   sudo apt install git      # Debian/Ubuntu
   sudo dnf install git      # Fedora
   ```

---

## 驗證安裝

啟動後：
1. 首頁出現 Novel Writer 標題
2. 右上角可點「⚙️ 設定」
3. 點「設定」→「測試連線」確認能連到 LLM（需先設定）
