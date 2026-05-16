import { useEffect } from "react";

interface Props {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * M5 (Spec 009 Round 2)：重設為出廠預設前的二次確認 modal。
 *
 * Dismissable modality：ESC + click-outside 都可取消（與 FirstLaunchWarning 的 lock modal 不同）。
 */
export function ResetConfirmDialog({ open, onCancel, onConfirm }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-confirm-title"
      data-modality="dismissable"
      data-testid="reset-confirm-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        // backdrop click → cancel
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="max-w-md w-full mx-4 rounded-lg border border-neutral-700 bg-neutral-900 p-6 space-y-4 shadow-xl">
        <h2 id="reset-confirm-title" className="text-lg font-semibold text-amber-400">
          ⚠️ 重設為出廠預設
        </h2>
        <p className="text-sm text-neutral-200">此動作會：</p>
        <ul className="list-disc pl-5 text-sm text-neutral-200 space-y-1">
          <li>清除所有 provider 設定（API key 全部刪除）</li>
          <li>清除所有 Agent routing 設定</li>
          <li>清除 system prompt 覆寫</li>
          <li>重新顯示首次啟動警語</li>
        </ul>
        <p className="text-sm text-neutral-400">
          <strong className="text-neutral-200">保留</strong>：「最近開啟」清單
        </p>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-neutral-600 rounded hover:bg-neutral-800"
            data-testid="reset-confirm-cancel"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-500"
            data-testid="reset-confirm-confirm"
          >
            確認重設
          </button>
        </div>
      </div>
    </div>
  );
}
