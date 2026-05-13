import { useState } from "react";

interface Props {
  value: string;
  onChange: (next: string) => void;
}

const UNSAFE_RE = /[/\\:*?"<>|]/;

export function TitleInput({ value, onChange }: Props) {
  const [touched, setTouched] = useState(false);
  const hasUnsafe = UNSAFE_RE.test(value);
  const isEmpty = value.trim() === "";
  const showError = touched && (hasUnsafe || isEmpty);

  return (
    <div className="flex flex-col">
      <input
        type="text"
        className={`px-2 py-1 border rounded text-sm ${
          showError ? "border-red-500" : "border-gray-300"
        }`}
        placeholder="章節標題"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setTouched(true)}
      />
      {hasUnsafe && (
        <span className="text-xs text-amber-600 mt-1">
          將會自動移除：/ \ : * ? " &lt; &gt; |
        </span>
      )}
      {touched && isEmpty && <span className="text-xs text-red-600 mt-1">標題不可為空</span>}
    </div>
  );
}
