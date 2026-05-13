# @novel-writer/web

Novel Writer v0.1 MVP — clickable React prototype.

This is a **pure-frontend prototype**: no backend, no LLM. All "saves" write to
IndexedDB in your browser; all "AI" responses are pre-canned text streamed
character-by-character.

## Run

```bash
cd apps/web
pnpm install
pnpm dev
```

Vite will print `Local: http://localhost:5173/` (or the next free port if
5173 is taken). Open that URL.

## What's seeded

On first load (and only the first load) the app populates IndexedDB with:

- 1 main project: **春日記事** (Spring Diary) with synopsis & path
- 2 additional "recent" projects (`暗河`, `街角咖啡店`) so the Home list is
  not empty
- 3 characters in Spring Diary: **蘇晴 / 林書言 / 蘇祖母**, each with the
  full 6-block field set + AI-generated body text
- 3 chapters: ch1 *梅雨初晴* (adopted), ch2 *書店的訪客* (saved), ch3 (draft)
- Story status + per-character status docs (with 🔖 / ✨ protected sections)
- Fake git commits for chapter / status files (used by the History drawer)
- Settings: all LLM providers default to **disabled** (per brief §6.8)

To re-seed, open DevTools → Application → IndexedDB → delete `novel-writer`,
then refresh.

## Scope

10 routes + 3 overlays, mapping 1-to-1 onto `docs/prototypes/design-brief.md`:

- `/` Home
- `/projects/new` Create project
- `/p/:slug` Project dashboard
- `/p/:slug/characters` Character list
- `/p/:slug/characters/:id` Character edit (6 blocks + AI body)
- `/p/:slug/chapters/:n` Chapter editor (main writing surface)
- `/p/:slug/status/story` Story status
- `/p/:slug/status/characters/:charId` Character status
- `/settings` Settings

Overlays: History drawer, Adopt-AI-draft modal, LLM-not-configured modal.
