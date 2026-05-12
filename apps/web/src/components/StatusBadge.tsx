import type { ChapterStatus, SaveState } from '@/types';

export function ChapterStatusBadge({ s }: { s: ChapterStatus }) {
  const label = s === 'draft' ? '草稿' : s === 'saved' ? '已儲存' : '已採用';
  const cls =
    s === 'draft'
      ? 'bg-ink-200 text-ink-700 dark:bg-ink-700 dark:text-ink-200'
      : s === 'saved'
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
      : 'bg-accent-subtle text-accent-dark dark:bg-accent-dark/40 dark:text-accent-subtle';
  return (
    <span className={'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ' + cls}>
      {label}
    </span>
  );
}

export function SaveStateIndicator({ s }: { s: SaveState }) {
  const map = {
    clean: { dot: '⚪', label: '乾淨', cls: 'text-ink-400' },
    dirty: { dot: '🔵', label: '編輯中', cls: 'text-status-dirty' },
    saved: { dot: '🟢', label: '已儲存', cls: 'text-status-saved' },
  } as const;
  const m = map[s];
  return (
    <span className={'inline-flex items-center gap-1 text-xs ' + m.cls} title={m.label}>
      <span aria-hidden>{m.dot}</span>
      <span>{m.label}</span>
    </span>
  );
}
