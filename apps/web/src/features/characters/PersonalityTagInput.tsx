import { useState } from "react";

interface Props {
  tags: string[];
  onChange: (tags: string[]) => void;
}

export function PersonalityTagInput({ tags, onChange }: Props) {
  const [input, setInput] = useState("");

  const add = () => {
    const val = input.trim();
    if (val && !tags.includes(val)) {
      onChange([...tags, val]);
    }
    setInput("");
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full bg-indigo-900/50 border border-indigo-700 px-2.5 py-0.5 text-xs text-indigo-200"
          >
            {t}
            <button
              type="button"
              onClick={() => onChange(tags.filter((x) => x !== t))}
              className="ml-0.5 text-indigo-400 hover:text-indigo-200 leading-none"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="輸入標籤後按 Enter"
          className="flex-1 rounded border border-neutral-600 bg-neutral-800 px-2 py-1 text-sm text-neutral-100 placeholder:text-neutral-500"
        />
        <button
          type="button"
          onClick={add}
          className="rounded bg-neutral-700 px-3 py-1 text-xs text-neutral-200 hover:bg-neutral-600"
        >
          新增
        </button>
      </div>
    </div>
  );
}
