import { useState } from "react";

interface Props {
  providerId: string;
  maskedValue: string;
  onChange: (raw: string) => void;
}

export function ApiKeyField({ providerId, maskedValue, onChange }: Props) {
  const [revealed, setRevealed] = useState(false);
  const [rawValue, setRawValue] = useState<string | null>(null);

  async function handleReveal() {
    const res = await fetch(`/api/settings/secret/${providerId}`);
    const data = (await res.json()) as { apiKey: string };
    setRawValue(data.apiKey);
    setRevealed(true);
  }

  function handleHide() {
    setRevealed(false);
    setRawValue(null);
  }

  return (
    <div className="flex gap-2 items-center">
      <input
        type={revealed ? "text" : "password"}
        className="flex-1 px-2 py-1 border rounded text-sm"
        value={revealed ? (rawValue ?? "") : maskedValue}
        placeholder="API key"
        onChange={(e) => {
          const v = e.target.value;
          if (revealed) setRawValue(v);
          onChange(v);
        }}
      />
      {!revealed ? (
        <button type="button" onClick={handleReveal} className="text-xs underline">
          顯示
        </button>
      ) : (
        <button type="button" onClick={handleHide} className="text-xs underline">
          隱藏
        </button>
      )}
    </div>
  );
}
