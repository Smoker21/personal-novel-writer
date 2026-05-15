import { Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface ExpandableTextareaProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minRowsInline?: number;
  maxLength?: number;
  label?: string;
  ariaLabel?: string;
  className?: string;
  id?: string;
}

function countChars(s: string): number {
  return [...s].length;
}

export function ExpandableTextarea(props: ExpandableTextareaProps) {
  const {
    value,
    onChange,
    placeholder,
    minRowsInline = 6,
    maxLength,
    label,
    ariaLabel,
    className = "",
    id,
  } = props;
  const [expanded, setExpanded] = useState(false);
  const modalRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setExpanded(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    modalRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey, true);
  }, [expanded]);

  const count = countChars(value);
  const over = maxLength !== undefined && count > maxLength;
  const counterText = maxLength !== undefined ? `${count} / ${maxLength} 字` : `${count} 字`;

  return (
    <div className={`relative ${className}`}>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={minRowsInline}
        aria-label={ariaLabel ?? label}
        className="w-full rounded border border-neutral-600 bg-neutral-800 px-3 py-2 pr-9 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-indigo-500 focus:outline-none"
      />
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="absolute right-2 top-2 rounded p-1 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
        title="展開全螢幕"
        aria-label="展開全螢幕"
      >
        <Maximize2 className="h-4 w-4" />
      </button>
      <div className={`mt-1 text-right text-xs ${over ? "text-red-400" : "text-neutral-500"}`}>
        {counterText}
      </div>

      {expanded && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={label ?? ariaLabel ?? "編輯"}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onMouseDown={() => setExpanded(false)}
        >
          <div
            className="relative flex flex-col rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl"
            style={{ width: "80vw", height: "80vh" }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-neutral-700 px-4 py-2">
              <span className="text-sm font-medium text-neutral-200">{label ?? "編輯內容"}</span>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="rounded p-1 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
                title="收回 (ESC)"
                aria-label="收回 (ESC)"
              >
                <Minimize2 className="h-4 w-4" />
              </button>
            </div>
            <textarea
              ref={modalRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              aria-label={ariaLabel ?? label}
              className="w-full flex-1 resize-none bg-neutral-900 px-4 py-3 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
            />
            <div
              className={`shrink-0 border-t border-neutral-700 px-4 py-2 text-right text-xs ${
                over ? "text-red-400" : "text-neutral-500"
              }`}
            >
              {counterText}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
