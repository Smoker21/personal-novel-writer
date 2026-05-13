# 0008. 前端架構：React 18 + Zustand + Dexie + Hono RPC

- Status: `Accepted`
- Date: `2026-05-12`
- Deciders: spec-architect

## Context

前端 stack 影響所有 spec 的「fe-N」開發任務。前輪討論已釐清傾向（React + Zustand + Dexie + Hono RPC client + Tailwind v4），本 ADR 釘死並補上 spec 002/003/009 動工所需細節。

關鍵需求（從各 spec 反推）：

- **編輯器**：CM6（[ADR-0005](./0005-editor-selection.md)）；React 整合走 `@uiw/react-codemirror`
- **兩層儲存**（Spec 003）：editor state → IndexedDB → markdown；需要 reactive store + IndexedDB 抽象
- **HTTP + SSE 客戶端**（Spec 005）：呼叫 sidecar 的 API + 接收串流
- **狀態跨元件共享**：「最近開啟」清單、目前專案、目前章節、設定頁、status 變更通知
- **無路由 / 單頁**：應用是「開一個專案編輯」，不需要 React Router 那種多路由體系

## Decision

### 核心 stack

| 層 | 選擇 | 版本 |
|---|---|---|
| Framework | **React** | 18+（暫不上 19，等 ecosystem 穩） |
| Build | **Vite** | 5+ |
| Language | **TypeScript** | strict mode、5.x |
| State management | **Zustand** | 4+ |
| Local storage | **Dexie**（IndexedDB wrapper） | 4+ |
| HTTP client | **Hono RPC client**（自動型別） | 與 server 同版 |
| SSE client | **內建 EventSource** + 薄包裝 | — |
| 編輯器 | **CodeMirror 6** | 依 ADR-0005 |
| CSS | **Tailwind v4** + design tokens | 4+ |
| UI primitives | **Radix UI**（按需引入單個 primitives） | 1+ |
| Form | **React Hook Form** + zod resolver | 7+ |
| Routing | **無**（單頁 + Zustand 的「目前 view」state） | — |
| Icons | **Lucide React** | — |
| Date / time | **date-fns**（不用 dayjs / moment） | — |
| 動畫 | **Motion**（前 Framer Motion） 按需 | — |

### 不採用的

- **Redux / RTK**：Zustand 的 store-per-feature 模式對個人工具足夠；Redux 的 boilerplate 與 DevTools 是過度設計
- **React Query / SWR**：sidecar 是本機 HTTP，延遲 < 5ms；不需要 cache invalidation 框架
- **Next.js / Remix**：本應用是 SPA on Tauri WebView，沒有 SSR 需求
- **shadcn/ui**：boilerplate 太多；用 Radix primitives 加 Tailwind 自寫
- **OpenAPI generator**：Hono RPC 已提供端到端型別

### Monorepo 結構

```
.
├── apps/
│   ├── web/             # React + Vite 前端
│   │   ├── src/
│   │   │   ├── app.tsx
│   │   │   ├── lib/
│   │   │   │   ├── api-client.ts        # Hono RPC client
│   │   │   │   ├── sse-client.ts        # EventSource 包裝
│   │   │   │   ├── tauri.ts             # Tauri command 包裝
│   │   │   │   └── db.ts                # Dexie database 定義
│   │   │   ├── stores/                  # Zustand stores
│   │   │   │   ├── project-store.ts
│   │   │   │   ├── editor-store.ts
│   │   │   │   ├── settings-store.ts
│   │   │   │   ├── agents-store.ts
│   │   │   │   └── ui-store.ts
│   │   │   ├── features/                # 功能模組
│   │   │   │   ├── home/                # 首頁（最近開啟）
│   │   │   │   ├── new-project/         # 新小說對話框
│   │   │   │   ├── editor/              # 章節編輯器
│   │   │   │   ├── characters/          # 角色面板
│   │   │   │   ├── settings/            # 設定頁
│   │   │   │   └── status-panel/        # status 編輯
│   │   │   └── components/              # 共用 UI（按鈕、對話框等）
│   │   └── vite.config.ts
│   ├── api/             # Hono sidecar
│   └── desktop/         # Tauri Rust 殼
├── packages/
│   ├── shared-types/    # 跨前後端 TS interface
│   ├── llm-adapter/     # LLM provider 抽象
│   └── prompt-library/  # 提示詞模板
└── tools/
    └── eval/            # 模型評估 CLI
```

### Zustand store 設計原則

**一個 store 對應一個 feature 領域**，不要全域 mega-store：

```ts
// stores/editor-store.ts
interface EditorStore {
  // state
  view: EditorView | null;              // CM6 view ref
  currentChapter: { number: number; title: string } | null;
  dirtyState: "clean" | "browser-only" | "saved";
  
  // actions
  setView: (view: EditorView | null) => void;
  setCurrentChapter: (chapter: ChapterRef) => void;
  markDirty: () => void;
  markSaved: () => void;
}
```

跨 store 通訊用 store 之間直接 import + subscribe；不引入 event bus。

### Dexie 設計

`apps/web/src/lib/db.ts`：

```ts
import Dexie, { Table } from "dexie";

export interface DraftRow {
  id: string;                      // `<projectHash>:chapter:<N>:draft`
  projectHash: string;
  chapterNumber: number;
  content: string;
  updatedAt: number;               // epoch ms
}

class NovelWriterDB extends Dexie {
  drafts!: Table<DraftRow, string>;
  
  constructor() {
    super("novel-writer");
    this.version(1).stores({
      drafts: "id, projectHash, [projectHash+chapterNumber]",
    });
  }
}

export const db = new NovelWriterDB();
```

未來加新 store（例：search index、UI prefs）時 `version(2).stores(...).upgrade(tx => ...)` 寫 migration。

### Hono RPC client

Hono server 端 export 型別：

```ts
// apps/api/src/index.ts
import { Hono } from "hono";
import { novels } from "./routes/novels";
import { settings } from "./routes/settings";

const app = new Hono()
  .route("/api/novels", novels)
  .route("/api/settings", settings);

export type AppType = typeof app;
```

前端 client 端：

```ts
// apps/web/src/lib/api-client.ts
import { hc } from "hono/client";
import type { AppType } from "../../../api/src/index";

let _client: ReturnType<typeof hc<AppType>> | null = null;

export async function getClient() {
  if (!_client) {
    const port = await tauriInvoke<number>("get_api_port");
    _client = hc<AppType>(`http://127.0.0.1:${port}`);
  }
  return _client;
}
```

每個 endpoint 的 request / response 型別前端編譯時自動可見；改 server 後前端立刻紅線。

### SSE client（spec 005 用）

```ts
// apps/web/src/lib/sse-client.ts
export function openSse<T>(url: string, onEvent: (event: string, data: T) => void) {
  const es = new EventSource(url);
  ["started", "chunk", "usage", "complete", "error", "degraded"].forEach(name => {
    es.addEventListener(name, (e) => onEvent(name, JSON.parse(e.data)));
  });
  return () => es.close();
}
```

中止 = 呼叫 cleanup function（關閉 EventSource）。

### Tailwind v4 + design tokens

`apps/web/src/styles/tokens.css`：

```css
@theme {
  --color-brand-50: ...;
  --color-brand-500: ...;
  --color-paper: ...;        /* 編輯器底色 */
  --color-ink: ...;          /* 編輯器文字 */
  --font-prose: "Noto Serif TC", serif;
  --font-ui: "Inter", "Noto Sans TC", sans-serif;
  --spacing-prose: 0.65em;   /* 段落間距 */
}
```

組件用 `<div class="bg-paper text-ink font-prose">...`；token 詳細色彩 / dark mode 留 P1 ADR。

### UI primitives

只引入 Radix 的「結構性」primitives（無視覺、可自訂樣式）：

- `@radix-ui/react-dialog`（新小說、二次確認）
- `@radix-ui/react-dropdown-menu`（章節右鍵選單）
- `@radix-ui/react-tabs`（角色卡欄位分區）
- `@radix-ui/react-toast`（status 完成通知）
- `@radix-ui/react-tooltip`（按鈕說明）
- `@radix-ui/react-accordion`（角色面板可摺疊區）
- `@radix-ui/react-switch`（設定開關）

不裝整套 shadcn/ui 或 Mantine。

### Form 處理

`react-hook-form` + `zod` resolver。schema 從 `packages/shared-types/` 拿（與 server zod validator 共用）。

```tsx
const schema = z.object({ title: z.string().min(1), synopsis: z.string().min(1), ... });
const { register, handleSubmit, formState } = useForm({ resolver: zodResolver(schema) });
```

## Consequences

**Positive:**

- **型別完全 end-to-end**：Hono RPC 把 server 型別穿透到 client，無需 OpenAPI generator 或手寫 client
- **state 管理輕量**：Zustand 套件 < 5 KB；學習曲線陡降；無 reducer / action / dispatch boilerplate
- **IndexedDB 抽象成熟**：Dexie 對 schema migration 與 reactive query 支援好
- **編輯器 / 兩層儲存 / SSE 三個核心場景皆有專屬工具**：CM6 + Dexie + EventSource
- **CSS 規模可控**：Tailwind v4 + design tokens 比寫 SCSS 模組快；token 集中讓 dark mode 後續可加
- **每個 feature 模組獨立**：features/ 結構讓多個小說專案功能可平行開發

**Negative:**

- **TS 5 編譯 watch 重啟**：monorepo + Hono RPC 型別穿透在改 server 端時前端要 reload；可接受（Vite HMR 處理）
- **Zustand 對「跨 store reactive query」沒有原生支援**：用 subscribe + immutable update 模式即可，但要紀律
- **Radix primitives 要自寫樣式**：相對 shadcn/ui 多寫一些 CSS；但避免一堆 generated boilerplate
- **無 RTK Query 等 cache 框架**：對 sidecar HTTP 預期延遲 < 5ms 不需要；若未來有「跨頁面共用查詢」需求再評估

**Neutral:**

- **React 19 等明年再上**：避免早期 ecosystem 不穩
- **i18n 框架不裝**：MVP 純繁中；未來加 lingui 或 react-i18next
- **logging / observability**：開發用 `consola` + browser devtools；生產級觀察性留 P2

## Alternatives considered

### React + Redux Toolkit
- Pros: 工業標準、DevTools 強、middleware 生態大
- Cons: boilerplate 多、學習曲線高、對個人工具過度
- 為何不選：個人本機工具不需要 Redux 規模

### React + Jotai
- Pros: atom-based、細粒度 reactive
- Cons: 跨 atom 組合複雜情境需要 selector；Zustand 對「feature store」直覺
- 為何不選：取捨上 Zustand 更直觀

### React + TanStack Query
- Pros: 強大的 cache / refetch / infinite scroll
- Cons: 本機 sidecar HTTP 延遲低，cache 收益小；增加學習面
- 為何不選：YAGNI；改用 Zustand store 直接持有 server state 拷貝

### SolidJS / Svelte
- Pros: 更小 bundle、更快 reactive
- Cons: 生態小於 React；編輯器、Radix、Lucide 等都優先支援 React
- 為何不選：生態優勢壓倒效能差異

### shadcn/ui 整套
- Pros: 開箱即用、設計感現代
- Cons: copy-paste boilerplate 多；要客製時需改 generated code；對「小說寫作」這種 unique UX 不一定合身
- 為何不選：直接用 Radix primitives 加自寫樣式，掌控度高

### Panda CSS / vanilla-extract
- Pros: TS-driven、type-safe
- Cons: 學習曲線陡；Tailwind v4 已支援大部分需求
- 為何不選：Tailwind 生態最熟、frontend-design plugin 對 Tailwind 友善

## 對其他文件的影響

- **Spec 002** 角色卡：用 React Hook Form + zod；frontmatter editing 用 Radix Tabs 分區；AI 統整按鈕觸發 Hono RPC `POST /api/projects/:hash/characters/:slug/consolidate`
- **Spec 003** 章節編輯器：CM6 EditorView 寫到 Zustand store；Dexie autosave；Hono RPC 「儲存」端點
- **Spec 005** AI 撰寫單章：EventSource 透過薄包裝接收串流；草稿展示元件接收 chunk
- **Spec 008** 開啟既有專案：呼叫 Tauri `dialog::open_directory` → 傳 path 給 Hono `POST /api/projects/open`
- **Spec 009** 設定頁：React Hook Form + zod；連線測試走 Hono RPC
- **ADR-0003** 技術棧：本 ADR 補上前端細節（原 ADR-0003 只規範後端與通訊協定）

## References

- Zustand: https://github.com/pmndrs/zustand
- Dexie: https://dexie.org/
- Hono RPC: https://hono.dev/docs/guides/rpc
- Radix Primitives: https://www.radix-ui.com/primitives
- Tailwind v4 alpha docs: https://tailwindcss.com/blog/tailwindcss-v4-alpha
- React Hook Form + zod: https://react-hook-form.com/get-started#SchemaValidation
