interface Props {
  path: string;
  onRemove: () => void;
  onRelocate: () => void;
  onCancel: () => void;
}

export function MissingProjectDialog({ path, onRemove, onRelocate, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 max-w-md space-y-4">
        <h2 className="text-lg font-semibold">找不到此專案</h2>
        <p className="text-sm">路徑：<code className="text-xs">{path}</code></p>
        <p className="text-sm text-gray-600">
          資料夾可能已被移動、刪除或卸載。請選擇下一步：
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onRelocate}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm"
          >
            重新指定路徑
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="px-4 py-2 border rounded text-sm"
          >
            從清單移除
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
