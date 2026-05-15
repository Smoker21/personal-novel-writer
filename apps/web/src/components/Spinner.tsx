import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

export interface SpinnerProps {
  estimatedSeconds?: number;
  onCancel?: () => void;
  message?: string;
  className?: string;
}

export function Spinner({ estimatedSeconds, onCancel, message, className = "" }: SpinnerProps) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 250);
    return () => clearInterval(t);
  }, []);

  const showText = elapsed >= 3;
  const showCancel = elapsed >= 15 && onCancel !== undefined;
  const text =
    message ??
    (estimatedSeconds
      ? showCancel
        ? `處理中…（已 ${elapsed} 秒 / 約 ${estimatedSeconds} 秒）`
        : `處理中…（約 ${estimatedSeconds} 秒）`
      : "處理中…");

  return (
    <span
      className={`inline-flex items-center gap-2 text-sm text-neutral-400 ${className}`}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-4 w-4 animate-spin" />
      {showText && <span>{text}</span>}
      {showCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-neutral-600 px-2 py-0.5 text-xs hover:bg-neutral-800"
        >
          取消
        </button>
      )}
    </span>
  );
}
