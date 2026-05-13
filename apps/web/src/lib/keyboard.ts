import { useEffect } from "react";

type Modifier = "ctrl" | "meta" | "alt" | "shift";

function parseCombo(combo: string): { key: string; mods: Set<Modifier> } {
  const parts = combo.toLowerCase().split("+");
  const key = parts.pop() ?? "";
  const mods = new Set<Modifier>();
  for (const m of parts) {
    if (m === "ctrl" || m === "meta" || m === "alt" || m === "shift") mods.add(m);
  }
  return { key, mods };
}

export function useGlobalKey(combo: string, handler: () => void): void {
  useEffect(() => {
    const { key, mods } = parseCombo(combo);
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== key) return;
      if (mods.has("ctrl") !== (e.ctrlKey || e.metaKey)) return;
      if (mods.has("alt") !== e.altKey) return;
      if (mods.has("shift") !== e.shiftKey) return;
      e.preventDefault();
      handler();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [combo, handler]);
}
