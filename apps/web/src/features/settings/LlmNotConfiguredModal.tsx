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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
        <h2 className="text-lg font-semibold text-neutral-100">LLM 路由未設定</h2>
        <p className="text-sm text-neutral-300">
          請先到設定頁設定 <strong className="text-neutral-100">{agentName}</strong>{" "}
          的預設模型，才能使用此功能。
        </p>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-neutral-400 hover:text-neutral-200"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              navigate("/settings");
              onClose();
            }}
            className="rounded bg-indigo-600 px-4 py-1.5 text-sm text-white hover:bg-indigo-500 transition-colors"
          >
            前往設定頁
          </button>
        </div>
      </div>
    </div>
  );
}
