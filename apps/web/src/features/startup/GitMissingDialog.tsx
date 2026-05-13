import { useState } from "react";

interface Props {
  onRetry: () => Promise<boolean>;
}

export function GitMissingDialog({ onRetry }: Props) {
  const [retrying, setRetrying] = useState(false);
  const [stillMissing, setStillMissing] = useState(false);

  async function handleRetry() {
    setRetrying(true);
    const found = await onRetry();
    setRetrying(false);
    if (!found) setStillMissing(true);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 max-w-md space-y-4">
        <h2 className="text-lg font-semibold">需要安裝 Git</h2>
        <p className="text-sm">
          Novel Writer 需要系統 Git 才能版本控制小說檔案。請先安裝 Git 後再繼續。
        </p>
        <ul className="text-sm space-y-1 ml-4 list-disc">
          <li>
            Windows:{" "}
            <a
              href="https://git-scm.com/download/win"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              git-scm.com/download/win
            </a>
          </li>
          <li>
            macOS: <code>brew install git</code> 或從 git-scm.com 下載
          </li>
          <li>
            Linux: <code>apt install git</code> / <code>dnf install git</code>
          </li>
        </ul>
        {stillMissing && (
          <p className="text-sm text-red-600">仍未偵測到 Git，請確認安裝後重新開啟應用。</p>
        )}
        <button
          type="button"
          onClick={handleRetry}
          disabled={retrying}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded"
        >
          {retrying ? "偵測中…" : "我已安裝，重試"}
        </button>
      </div>
    </div>
  );
}
