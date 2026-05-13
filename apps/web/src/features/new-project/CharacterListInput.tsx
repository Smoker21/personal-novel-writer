interface Character {
  name: string;
  description: string;
}

interface Props {
  value: Character[];
  onChange: (next: Character[]) => void;
}

export function CharacterListInput({ value, onChange }: Props) {
  function update(idx: number, patch: Partial<Character>) {
    onChange(value.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  function add() {
    onChange([...value, { name: "", description: "" }]);
  }

  function remove(idx: number) {
    if (value.length === 1) return; // at least 1 required
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-3">
      {value.map((c, idx) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 表單項目，順序穩定，無 reorder
        <div key={`char-${idx}`} className="border rounded p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">角色 {idx + 1}</span>
            {value.length > 1 && (
              <button
                type="button"
                onClick={() => remove(idx)}
                className="text-xs text-red-500 underline"
              >
                移除
              </button>
            )}
          </div>
          <input
            type="text"
            placeholder="角色名"
            className="w-full px-2 py-1 border rounded text-sm"
            value={c.name}
            onChange={(e) => update(idx, { name: e.target.value })}
          />
          <textarea
            placeholder="角色描寫"
            rows={3}
            className="w-full px-2 py-1 border rounded text-sm resize-none"
            value={c.description}
            onChange={(e) => update(idx, { description: e.target.value })}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="text-sm px-3 py-1 border rounded border-dashed"
      >
        + 新增角色
      </button>
    </div>
  );
}
