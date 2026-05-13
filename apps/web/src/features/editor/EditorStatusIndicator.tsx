import type { EditorStateKind } from "../../stores/editor-store";

interface Props {
  state: EditorStateKind;
}

function secondsAgo(epoch: number): number {
  return Math.max(0, Math.floor((Date.now() - epoch) / 1000));
}

export function EditorStatusIndicator({ state }: Props) {
  if (state.kind === "loading") {
    return <span className="text-xs text-gray-400">載入中…</span>;
  }
  if (state.kind === "clean") {
    return <span className="text-xs text-green-600">🟢 已儲存到 .md</span>;
  }
  if (state.kind === "browser-only") {
    return (
      <span className="text-xs text-amber-600">
        🟡 編輯中（已 autosave 到 browser，{secondsAgo(state.lastAutoSaveAt)} 秒前）
      </span>
    );
  }
  return (
    <span className="text-xs text-red-600">
      🔴 儲存失敗：{state.reason}
      {state.retryCount > 0 && `（重試 ${state.retryCount}/3）`}
    </span>
  );
}
