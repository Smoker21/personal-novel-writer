import { useEffect, useState } from "react";

interface Props {
  providerId: string;
  maskedValue: string;
  onChange: (raw: string) => void;
}

/**
 * M5 (Spec 009)：API key 輸入框。
 *
 * - 預設**顯示**（type=text）：本機個人工具偏好。
 * - 切換 hide → 純粹改 input type=password，**不**動 React state（M4 bug 修復）。
 * - 第一次掛載時 fetch 真實 key（GET /api/settings/secret/:provider）填入；
 *   失敗或為空就維持 maskedValue 顯示。
 */
export function ApiKeyField({ providerId, maskedValue, onChange }: Props) {
  const [hidden, setHidden] = useState(false);
  const [rawValue, setRawValue] = useState<string>("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let aborted = false;
    void fetch(`/api/settings/secret/${providerId}`)
      .then((r) => r.json() as Promise<{ apiKey: string }>)
      .then((data) => {
        if (aborted) return;
        setRawValue(data.apiKey ?? "");
        setLoaded(true);
      })
      .catch(() => {
        if (aborted) return;
        setLoaded(true);
      });
    return () => {
      aborted = true;
    };
  }, [providerId]);

  // While loading, show the masked placeholder so the field isn't empty.
  const displayValue = loaded ? rawValue : maskedValue;

  return (
    <div className="flex gap-2 items-center">
      <input
        data-testid={`api-key-${providerId}`}
        type={hidden ? "password" : "text"}
        className="flex-1 px-2 py-1 border rounded text-sm font-mono"
        value={displayValue}
        placeholder="API key"
        onChange={(e) => {
          const v = e.target.value;
          setRawValue(v);
          onChange(v);
        }}
      />
      <button
        type="button"
        onClick={() => setHidden((h) => !h)}
        className="text-xs underline whitespace-nowrap"
        title={hidden ? "顯示明文" : "切換為遮蔽"}
      >
        {hidden ? "顯示" : "遮蔽"}
      </button>
    </div>
  );
}
