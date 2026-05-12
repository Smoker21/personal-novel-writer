---
name: create-adr
description: Capture an Architecture Decision Record under docs/architecture/adr/. Use when the user makes or asks to record a non-trivial technical decision — choice of framework, library, data model approach, deployment strategy, or any change that future maintainers will need to understand the *why* of. Skips trivial choices (formatter config, minor refactors).
---

# Create ADR

## When to use

- 「我們決定用 NestJS 而不是 Express，記下來」
- 「為什麼要把 LLM 抽象成 adapter？寫個 ADR」
- 重大依賴升級、儲存方案、模型策略、跨切面決策

不要為 commit 級別的小修改寫 ADR。

## Steps

1. Glob `docs/architecture/adr/` 取下一個編號（4 位補零）
2. AskUserQuestion 釐清缺漏：
   - 決策標題（一句話）
   - 已考慮過哪些選項？
   - 為何選這個？（trade-off）
   - 是否取代既有 ADR？
3. 用 `docs/architecture/adr/_template.md` 結構產生 `NNNN-<kebab-title>.md`
4. 把新 ADR 列進 `docs/architecture/adr/README.md`（若不存在則建立索引檔）
5. 若取代既有 ADR，更新被取代者的 status 為 `Superseded by NNNN`

## Output

ADR 採 Michael Nygard 風格：

- Status（Proposed / Accepted / Deprecated / Superseded）
- Context
- Decision
- Consequences（含 negative）
- Alternatives considered（重要！）
