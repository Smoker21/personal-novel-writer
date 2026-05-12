# Spec: <story 標題>

> Story: `docs/requirements/stories/<NNN>-<slug>.md`
> BDD: `docs/requirements/features/<NNN>-<slug>.feature`
> Status: `Draft | Ready | Frozen`
> Owner: `spec-architect`
> Last updated: `YYYY-MM-DD`

## 待 PM 釐清

> Status=`Draft` 時必填；`Ready` / `Frozen` 時應為空。

- [ ] **<問題標題>**
  - **問題**：<story 中發現的矛盾、缺漏或邊界未定>
  - **影響**：<不釐清會導致什麼後果>
  - **選項**：
    1. <選項 A 與其代價>
    2. <選項 B 與其代價>

## 摘要

<一段話：此功能在系統中扮演的角色>

## API 合約

### POST /api/<...>

**Auth:** `<required | public>`

**Request:**
```ts
{
  // ...
}
```

**Response 200:**
```ts
{
  // ...
}
```

**Errors:**
| Status | Code | When |
|--------|------|------|
| 400 | `INVALID_INPUT` | <情境> |
| 401 | `UNAUTHORIZED` | <情境> |

## 資料模型

新增 / 變更（指向 `packages/shared-types/`）：

```ts
// packages/shared-types/src/<file>.ts
interface ... { }
```

## 跨元件協議

<呼叫順序、訊息流、副作用、事務邊界>

## LLM adapter 合約

> 不涉及 AI 時刪除本節。

- 觸發的產品內 Agent / Skill：`docs/agents/<slug>.md` 或 `docs/skills/<slug>.md`
- 上層需提供的上下文：<列舉>
- 串流：是 / 否
- 失敗處置：<降級到地端 / 顯示錯誤 / 重試 N 次>

## 非功能性

- **效能**：<例：p95 < 500ms>
- **容量**：<例：單一專案章節數 ≤ 1000>
- **安全**：<例：未登入禁止>
- **可用性**：<例：無離線需求>

## 開發任務拆解

> 每項應可獨立 PR，且能對應到 .feature 中至少一個 Scenario。

- [ ] **be**: <後端任務>（→ Scenario X）
- [ ] **fe**: <前端任務>（→ Scenario Y）
- [ ] **types**: <shared-types 變更>
- [ ] **qa**: step definitions for `<NNN>.feature`

## 變更紀錄

- `YYYY-MM-DD`: 初版
