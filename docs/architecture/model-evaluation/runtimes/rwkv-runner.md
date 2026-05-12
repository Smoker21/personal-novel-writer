# Runtime 指南：RWKV-Runner

> 來源：https://github.com/josStorer/RWKV-Runner
> 適用模型：RWKV 系列（World / Pile / Raven 等任何 v4/v5/v6/v7）
> 為何單獨寫指南：RWKV 是 **RNN 架構**，與 Transformer（Qwen、Llama 等）行為差異大；prompt format、長 context 行為、採樣需求都不同，不能直接套 LM Studio 的設定。

## 為何選 RWKV 模型評估

評估 RWKV 是因為它的工程特性與 Transformer 互補：

- **VRAM 占用低**：3B / 7B 級別在 8 GB 級顯卡能跑，1.5B 甚至 CPU-only 能用
- **推論成本與輸入長度線性**（非平方），長 context 推得動
- **理論無 context window 上限**：RNN 把過去壓縮在 hidden state 中
- **快速啟動**：載入時間短

對應到本應用的可能定位：

| Agent / Skill | 是否適合 RWKV | 理由 |
|---|---|---|
| `chapter-writer` | 視 size | 需指令遵循與長 context 一致性，RWKV 弱項 |
| `status-updater` | 可能合適 | 任務專一，輸出短 |
| `chapter-titler` | 合適 | 簡單任務 |
| `polish-prose` | 適合 | 局部變換 |
| `continuity-checker` | 視 size | 需精確召回，RNN 弱項 |

跑完評估再下定論——本指南不預判，僅給跑的方法。

## 安裝 RWKV-Runner

Windows release：https://github.com/josStorer/RWKV-Runner/releases

選 `RWKV-Runner_windows_x64.exe`，解壓直接跑。第一次啟動會拉 Python 依賴到 `py310/`，開瀏覽器到 `http://localhost:27777`。

macOS / Linux 從 source 跑：

    git clone https://github.com/josStorer/RWKV-Runner.git
    cd RWKV-Runner
    python -m venv venv
    source venv/bin/activate
    pip install -r backend-python/requirements.txt
    cd frontend && npm install && npm run build && cd ..
    python ./backend-python/main.py --port 8000 --host 127.0.0.1

## 載入模型

RWKV 用 `.pth`（PyTorch）或 `.st`（safetensors）格式，**不是 GGUF**。

### 必須先轉成 safetensors

從 HF 下載的多半是 `.pth`。RWKV-Runner 新版 backend 通常會要求轉成 `.st`，原因：

- **安全**：`.pth` = pickle，載入會執行 Python code；`.safetensors` 純資料零執行
- **速度**：`.safetensors` 支援 mmap，載入快、記憶體占用低
- **生態**：上游正在淘汰 `.pth`；WebGPU / rwkv.cpp backend 只認 `.st`

### 流程

1. 把 `.pth` 放到任意目錄（建議 `F:/workspace/novel_writer/ai-model/`）
2. **如必要先轉檔**：UI 點「Convert」→ 選 .pth → 等待（7B 模型約 1-3 分鐘，需 ~16 GB RAM、額外 14 GB 磁碟空間）→ 同目錄產生 `.st`
3. UI「模型」頁 → 「配置」
4. 「Model」欄選擇 `.st`（或舊版 backend 仍接受 `.pth`）
5. 「Strategy」選擇推論策略（見下節）
6. 點「Run」啟動推論服務器
7. 轉檔完成後可刪除原 `.pth` 節省空間

### 轉檔失敗常見原因

| 症狀 | 原因 | 處置 |
|------|------|------|
| OOM during convert | RAM 不足 | 關掉其他程式；或在命令列用 streaming convert |
| 磁碟寫入失敗 | 空間不足 / 唯讀 | 確認 14 GB+ 可寫空間 |
| 載入後輸出亂碼 | .pth 檔損毀（下載中斷） | 重新下載；用 HF 的 LFS 校驗大小 |
| Convert 按鈕找不到 | 舊版 UI / 簡化版本 | 命令列：`python -c "from rwkv.utils import convert_torch_to_safetensors; convert_torch_to_safetensors('xxx.pth', 'xxx.st')"`，或從 BlinkDL/ChatRWKV repo 抓 `v2/convert_model.py` |

### Strategy（推論策略）

Strategy 字串控制每層在哪個裝置、用什麼精度。

| Strategy | 適用 | 說明 |
|---|---|---|
| `cuda fp16` | RTX 30/40 16 GB+ | 最快；7B fp16 約 14 GB VRAM |
| `cuda fp16i8` | RTX 30/40 8~12 GB | 部分 int8；7B 約 9 GB VRAM |
| `cuda fp16i8 *20+` | 8 GB VRAM | 前 20 層 int8 在 GPU，其餘 CPU |
| `cuda fp16 *0+ -> cpu fp32 *1` | 顯卡很小 | 大部分跑 CPU |
| `cpu fp32` | 無 GPU | 慢但可用 |
| `cuda nf4` | 8 GB VRAM 想跑大模型 | nf4 量化，犧牲品質 |

**建議先試 `cuda fp16i8 *20+`**。若 OOM 把 `20` 改小（例如 `*15+`）。

詳細 strategy 文件：https://github.com/BlinkDL/ChatRWKV#strategy

## API 端點

啟動後 RWKV-Runner 提供 OpenAI-compatible API：

- `POST http://localhost:27777/v1/chat/completions`
- `POST http://localhost:27777/v1/completions`
- `GET  http://localhost:27777/v1/models`

預設 port **27777**（不是 LM Studio 的 1234）。UI「設定」可改。

## 與 Transformer 跑模型的關鍵差異

下列差異會直接影響你怎麼跑 test cases，請逐項留意。

### 1. System prompt 是模擬的

RWKV 沒有原生 system / user / assistant role 概念。RWKV-Runner 收到 `messages: [{role: "system"}, {role: "user"}]` 時，會在內部把它們串成 RWKV 偏好的格式——通常是 `User: <system+user>\n\nAssistant: ` 之類。

**對 test case 執行的影響：**

- 跑 `chat/completions` 時，把 system content 整段放在 system role 裡，**不要**自己拆到 user 訊息——讓 RWKV-Runner 處理串接
- 若發現指令遵循變差（最常見：模型沒按 system 規則做），改用 `completions` 端點，自己組 prompt：

      User: 你是中文小說章節寫手...（原 system 內容）
      （原 user 內容）

      Assistant:

  注意 `Assistant:` 後面要留空（空白或一個空格），讓模型從這裡開始續寫。

### 2. Prompt format 敏感

RWKV-5 / 6 World 系列訓練時偏好：

    User: <prompt>

    Assistant: <reply>

每對 turn 之間用兩個換行。少一個換行可能導致風格漂移。RWKV-Runner UI 的「Default」preset 會處理這個，但若你直接打 API 要自己注意。

### 3. 沒有「stop token」習慣

Transformer 通常用 `<|im_end|>` 之類的特殊 token 結束生成，RWKV 用 `\n\nUser:` 或單純的雙換行。預設 stop sequence 設成：

    ["\n\nUser:", "\n\nHuman:"]

RWKV-Runner UI 的 Chat 模式會自動加，但 raw API 要在 request 帶上 `stop`。

### 4. 採樣參數需要不同預設

Transformer 慣用 temperature 0.7、top-p 0.9。RWKV 對採樣更敏感，**官方建議**：

| 參數 | RWKV 建議 | 說明 |
|---|---|---|
| temperature | 1.0 | 比 Transformer 高，因為 RWKV logits 分佈較銳 |
| top-p | 0.5~0.7 | 比 Transformer 低，避免採樣到 long tail |
| presence penalty | 0.4 | 避免重複 |
| frequency penalty | 0.4 | 避免重複 |
| penalty alpha | 0.996 | 衰減係數 |

對 test cases 的調整：

| Test case | LM Studio 用的設定 | RWKV-Runner 對應 |
|---|---|---|
| TC-01/03/06/07/08（小說相關） | T=0.7, top_p=0.9 | T=1.0, top_p=0.6, presence/freq penalty=0.4 |
| TC-02/04/05（指令類） | T=0.2~0.5 | T=0.5, top_p=0.5, presence/freq penalty=0.6 |

### 5. RNN 記憶衰減（關鍵）

Transformer 對 context window 內任意位置的 token 都能 attend。RWKV 用 hidden state 線性壓縮過去——**離當前 token 越遠的內容衰減越多**。

對小說應用的影響：

- 若 user prompt 很長（例 TC-07：synopsis + status + 多份角色卡 + outline + 前章摘要），**最早提到的內容**最容易被忽略
- 對策：把**最重要的指令**放在 user prompt **末尾**（最接近 Assistant: 處）
- 例：TC-07 的 user prompt 末尾建議補一句「請特別注意：此章必須提到蘇晴帶來的母親照片」

評估時要**主動觀察**這個現象——這是 RWKV 與 Transformer 最大的行為差異。

### 6. 上下文累積

RWKV-Runner 的 chat 模式會**保留 hidden state**——對話歷史被「壓進」state，不是每次重送整段 prompt。這帶來：

- 連續對話更快（不需重算）
- 但**每個 test case 之間必須清乾淨 state**：UI 點「Reset」或在 API 帶 `stream=false` 並重起一個 conversation；不清會污染下個 case

## 對本應用 LLM adapter 的影響

[ADR-0004](../../adr/0004-llm-adapter.md) 設計時假設 OpenAI-compatible 行為。RWKV-Runner 雖然提供同形 API，但：

- `messages` 的 system role 會被吃下、模擬處理（沒問題）
- 採樣參數需要不同 default（要在 settings.yaml 對 RWKV provider 寫不同 default）
- 模型 ID 寫法建議：`rwkv-runner:<model-file-stem>`，例 `rwkv-runner:rwkv-5-h-world-7b`

未來若把 RWKV-Runner 納入 settings.yaml：

    providers:
      rwkv-runner:
        endpoint: http://localhost:27777/v1
        defaultSampling:
          temperature: 1.0
          topP: 0.6
          presencePenalty: 0.4
          frequencyPenalty: 0.4

每個 Agent / Skill 在「模型建議」段引用此 provider 時，sampling 走 provider default 而非全域 default——`packages/llm-adapter` 的 `LLMRouter` 要支援 per-provider sampling override。

## 給評估者的執行清單

跑 test cases 前：

1. 確認 RWKV-Runner 已啟動，瀏覽器能打開 `http://localhost:27777`
2. 模型載入成功（UI 顯示綠燈），測一個 prompt 確認回覆正常
3. 採樣參數調成本指南建議值
4. 對每個 test case：
   - **每次都先清 state（UI「Reset」按鈕）** 否則前一 case 會干擾
   - 觀察「指令在 user prompt 末尾 vs 開頭」對輸出的影響（這是 RWKV 特有觀察）
   - 記下 token/s 與 first-token latency
5. 跑完填到 `results/<日期>-rwkv-5-h-world.md`，並在 RWKV 特殊觀察區記錄記憶衰減情況

## 常見問題

**Q：API 回傳「context length exceeded」**
A：RWKV 理論無上限，但 `Length per chunk` 設太小會限制。改大或在 UI 設成 8192+。

**Q：模型回覆混入英文 / 簡體**
A：World 系列訓練含多語料，繁中需要在 prompt 中明示。在 system / user prompt 開頭加「請以繁體中文回應」。

**Q：模型一直重複同一段**
A：presence/frequency penalty 太低，調到 0.4~0.6。

**Q：模型把 system prompt 「念出來」當回覆**
A：RWKV 對 prompt format 敏感的後遺症。改用 `completions` 端點手刻 prompt，並確保 `Assistant:` 後留空。
