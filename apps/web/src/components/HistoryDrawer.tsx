import { useEffect, useState } from 'react';
import { Drawer } from './Drawer';
import { Button } from './Button';
import { listCommits } from '@/storage/projectStore';
import type { Commit } from '@/types';
import { formatAbsTime, formatRelativeTime } from '@/utils/time';

interface Props {
  open: boolean;
  onClose: () => void;
  fileKey: string;
  fileLabel: string;
  onRestore?: (snapshot: string, commitMsg: string) => void;
}

export function HistoryDrawer({ open, onClose, fileKey, fileLabel, onRestore }: Props) {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [selected, setSelected] = useState<Commit | null>(null);
  const [confirmingRestore, setConfirmingRestore] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setConfirmingRestore(false);
      return;
    }
    void listCommits(fileKey).then(setCommits);
  }, [open, fileKey]);

  const width = selected ? 720 : 480;

  return (
    <Drawer open={open} onClose={onClose} title={`歷史 — ${fileLabel}`} width={width}>
      <div className="flex h-full">
        <div className={selected ? 'w-[300px] border-r border-ink-200 dark:border-ink-700 overflow-y-auto' : 'w-full overflow-y-auto'}>
          {commits.length === 0 && (
            <div className="text-ink-400 text-sm px-5 py-10 text-center">尚無歷史紀錄</div>
          )}
          <ul>
            {commits.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setSelected(c)}
                  className={
                    'w-full text-left px-4 py-3 border-b border-ink-100 dark:border-ink-700/60 hover:bg-ink-100 dark:hover:bg-ink-700/40 ' +
                    (selected?.id === c.id ? 'bg-accent-subtle dark:bg-accent-dark/40' : '')
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm truncate">{c.message}</div>
                    {c.isCurrent && (
                      <span className="bg-status-saved text-white text-[10px] px-1.5 py-0.5 rounded">目前版本</span>
                    )}
                  </div>
                  <div className="text-xs text-ink-400 mt-1 flex items-center gap-2">
                    <span title={formatAbsTime(c.authorTime)}>{formatRelativeTime(c.authorTime)}</span>
                    <span>·</span>
                    <span className={c.wordDelta >= 0 ? 'text-status-saved' : 'text-status-error'}>
                      {c.wordDelta >= 0 ? '+' : ''}{c.wordDelta} 字
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {selected && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-5 py-3 border-b border-ink-200 dark:border-ink-700 flex items-center justify-between">
              <div className="text-sm">
                <div className="font-medium">{selected.message}</div>
                <div className="text-xs text-ink-400">{formatRelativeTime(selected.authorTime)} · {formatAbsTime(selected.authorTime)}</div>
              </div>
            </div>
            <div className="flex-1 overflow-auto px-5 py-4 font-prose whitespace-pre-wrap text-ink-700 dark:text-ink-200">
              {selected.snapshotContent || <span className="text-ink-400">（內容空白）</span>}
            </div>
            <div className="px-5 py-3 border-t border-ink-200 dark:border-ink-700 flex justify-end gap-2">
              {confirmingRestore ? (
                <>
                  <span className="text-xs text-ink-500 self-center mr-2">確定還原？目前內容會被覆蓋。</span>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmingRestore(false)}>取消</Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      onRestore?.(selected.snapshotContent, selected.message);
                      setConfirmingRestore(false);
                      onClose();
                    }}
                  >
                    確定還原
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" size="sm" disabled title="prototype 不做 unified diff">⇄ Diff 與當前比較</Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirmingRestore(true)}
                    disabled={selected.isCurrent}
                  >
                    ⟲ 還原到此版本
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}
