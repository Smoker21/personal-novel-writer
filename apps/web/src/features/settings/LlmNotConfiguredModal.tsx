import { useNavigate } from "react-router-dom";

interface Props {
  agentName: string;
  open: boolean;
  onClose: () => void;
}

export function LlmNotConfiguredModal({ agentName, open, onClose }: Props) {
  const navigate = useNavigate();

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 max-w-md w-full space-y-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="text-2xl mt-0.5">⚙️</span>
          <div>
            <h2 className="text-base font-semibold text-neutral-100">尚未設定 AI 模型</h2>
            <p className="text-sm text-neutral-400 mt-1">使用「{agentName}」前需先設定 LLM。</p>
          </div>
        </div>
        <ol className="text-xs text-neutral-300 space-y-2 bg-neutral-900/60 rounded-lg p-3 list-decimal list-inside">
          <li>點「前往設定頁」</li>
          <li>在「LLM Providers」啟用一個 provider（建議 LM Studio 地端免費）</li>
          <li>
            在「Agent 預設模型」為 <strong className="text-neutral-100">{agentName}</strong>{" "}
            選擇模型
          </li>
          <li>點「儲存」後返回繼續操作</li>
        </ol>
        <div className="bg-neutral-900/40 rounded p-2 text-xs text-neutral-500">
          💡 本機免費推薦：安裝 LM Studio，下載 Qwen2.5-14B，啟用 Server
        </div>
        <div className="flex gap-3 justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            稍後設定
          </button>
          <button
            type="button"
            onClick={() => {
              navigate("/settings");
              onClose();
            }}
            className="rounded bg-indigo-600 px-4 py-1.5 text-sm text-white hover:bg-indigo-500 transition-colors"
          >
            前往設定頁 →
          </button>
        </div>
      </div>
    </div>
  );
}
