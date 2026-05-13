import type { GitStatus } from "@novel-writer/shared-types";

interface Props {
  status: GitStatus;
  onDismiss?: () => void;
}

export function ConflictBanner({ status, onDismiss }: Props) {
  if (status.clean) return null;

  return (
    <div className="bg-amber-100 border-l-4 border-amber-500 p-3 text-sm flex items-start gap-3">
      <span className="text-amber-700 font-semibold shrink-0">⚠</span>
      <div className="flex-1">
        <p className="font-medium">外部變更已偵測</p>
        <p className="text-gray-600 mt-1">
          {status.changes.length} 個檔案有未提交變更。請檢視後決定是否載入。
        </p>
        <ul className="mt-2 ml-4 list-disc text-xs">
          {status.changes.slice(0, 5).map((c) => (
            <li key={c.path}>
              {c.path} <span className="text-gray-400">({c.status})</span>
            </li>
          ))}
          {status.changes.length > 5 && (
            <li className="text-gray-400">…還有 {status.changes.length - 5} 個</li>
          )}
        </ul>
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="text-xs underline shrink-0">
          知道了
        </button>
      )}
    </div>
  );
}
