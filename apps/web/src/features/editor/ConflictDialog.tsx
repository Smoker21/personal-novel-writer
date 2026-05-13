interface Props {
  kind: "open" | "save";
  localContent: string;
  serverContent: string;
  onApplyServer: () => void;
  onForceLocal: () => void;
  onCancel: () => void;
}

function preview(s: string): string {
  return s.length > 200 ? `${s.slice(0, 200)}…` : s;
}

export function ConflictDialog({
  kind,
  localContent,
  serverContent,
  onApplyServer,
  onForceLocal,
  onCancel,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full space-y-4">
        <h2 className="text-lg font-semibold">
          {kind === "open" ? "外部變更已偵測（開啟時）" : "儲存衝突（外部已修改）"}
        </h2>
        <p className="text-sm text-gray-600">
          .md 檔案在 app 外被修改過。請選擇要保留哪個版本：
        </p>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="border rounded p-2 space-y-1">
            <div className="font-medium">伺服器版本（.md）</div>
            <pre className="whitespace-pre-wrap bg-gray-50 p-2 rounded">
              {preview(serverContent)}
            </pre>
          </div>
          <div className="border rounded p-2 space-y-1">
            <div className="font-medium">我的版本（編輯器）</div>
            <pre className="whitespace-pre-wrap bg-gray-50 p-2 rounded">
              {preview(localContent)}
            </pre>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-2 border-t">
          <button
            type="button"
            onClick={onApplyServer}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm"
          >
            載入伺服器版本（捨棄我的編輯）
          </button>
          <button
            type="button"
            onClick={onForceLocal}
            className="px-4 py-2 border border-red-500 text-red-600 rounded text-sm"
          >
            強制儲存我的版本（覆寫伺服器）
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-gray-500 text-sm"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
