// Draft panel — third column of the three-column AI writing layout.
// Displays streaming / editable AI draft with action buttons.

export type DraftState = 'idle' | 'streaming' | 'done' | 'edited';

interface DraftPanelProps {
  text: string;
  onChange: (v: string) => void;
  streaming: boolean;
  manuallyEdited: boolean;
  wordCount: number;
  elapsed: number;
  modelLabel: string;
  onAbort: () => void;
  onAdopt: () => void;
  onDiscard: () => void;
  onRegenerate: () => void;
}

function DraftStateBadge({
  streaming,
  hasText,
  manuallyEdited,
}: {
  streaming: boolean;
  hasText: boolean;
  manuallyEdited: boolean;
}) {
  if (streaming) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 animate-pulse">
        ✨ AI 撰寫中…
      </span>
    );
  }
  if (!hasText) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-ink-100 text-ink-500 dark:bg-ink-700 dark:text-ink-400">
        等待生成
      </span>
    );
  }
  if (manuallyEdited) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
        AI 草稿（已手動修改）
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
      AI 草稿（未修改）
    </span>
  );
}

export function DraftPanel({
  text,
  onChange,
  streaming,
  manuallyEdited,
  wordCount,
  elapsed,
  modelLabel,
  onAbort,
  onAdopt,
  onDiscard,
  onRegenerate,
}: DraftPanelProps) {
  const hasText = text.length > 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-ink-200 dark:border-ink-700 flex items-center gap-2 shrink-0 bg-white dark:bg-ink-800">
        <span className="text-xs font-semibold text-ink-500 dark:text-ink-300 uppercase tracking-wide mr-1">
          AI 草稿
        </span>
        <DraftStateBadge
          streaming={streaming}
          hasText={hasText}
          manuallyEdited={manuallyEdited}
        />
      </div>

      {/* Textarea */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <textarea
          value={text}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          placeholder={
            streaming
              ? ''
              : '點擊「✨ AI 撰寫本章」或「重產出」來生成草稿。生成中可以直接修改。'
          }
          spellCheck={false}
          className="flex-1 w-full h-full resize-none bg-transparent outline-none font-prose text-ink-700 dark:text-ink-200 leading-[1.8] px-5 py-4 placeholder:text-ink-300 dark:placeholder:text-ink-600"
          style={{ fontSize: '15px' }}
        />
      </div>

      {/* Bottom info bar */}
      <div className="px-4 py-2 border-t border-ink-200 dark:border-ink-700 shrink-0 bg-white dark:bg-ink-800">
        <div className="flex items-center gap-2 text-[11px] text-ink-400 dark:text-ink-500 mb-2 flex-wrap">
          <DraftStateBadge
            streaming={streaming}
            hasText={hasText}
            manuallyEdited={manuallyEdited}
          />
          <span className="text-ink-300 dark:text-ink-600">|</span>
          <span>{wordCount.toLocaleString()} 字</span>
          {modelLabel && (
            <>
              <span className="text-ink-300 dark:text-ink-600">|</span>
              <span>使用 {modelLabel}</span>
            </>
          )}
          {!streaming && elapsed > 0 && (
            <>
              <span className="text-ink-300 dark:text-ink-600">|</span>
              <span>{elapsed} 秒</span>
            </>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {streaming && (
            <button
              type="button"
              onClick={onAbort}
              className="inline-flex items-center text-xs px-2.5 py-1.5 rounded font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
            >
              中止
            </button>
          )}
          <button
            type="button"
            onClick={onRegenerate}
            className="inline-flex items-center text-xs px-2.5 py-1.5 rounded font-medium bg-transparent border border-ink-200 dark:border-ink-600 text-ink-700 dark:text-ink-200 hover:bg-ink-50 dark:hover:bg-ink-700 transition-colors"
          >
            重產出
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="inline-flex items-center text-xs px-2.5 py-1.5 rounded font-medium bg-transparent border border-ink-200 dark:border-ink-600 text-ink-700 dark:text-ink-200 hover:bg-ink-50 dark:hover:bg-ink-700 transition-colors"
          >
            丟棄
          </button>
          <button
            type="button"
            onClick={onAdopt}
            disabled={!hasText}
            className="inline-flex items-center text-xs px-3 py-1.5 rounded font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors ml-auto"
          >
            採用
          </button>
        </div>
      </div>
    </div>
  );
}
