import { useCallback, useEffect, useRef, useState } from 'react';
import type { SaveState } from '@/types';

interface AutosaveOptions {
  debounceMs?: number;
  onAutosave?: (value: string) => Promise<void> | void;
}

/**
 * Three-state save indicator + debounced autosave.
 *
 *   clean: equal to last *manually saved* value, no pending write
 *   dirty: user typed, autosave debounce is running OR autosave just landed
 *          but user hasn't pressed "儲存" yet
 *   saved: user pressed "儲存" → flash green for ~1.5s → fall back to clean
 */
export function useDebouncedAutosave(
  value: string,
  opts: AutosaveOptions = {},
) {
  const debounceMs = opts.debounceMs ?? 1500;
  const onAutosave = opts.onAutosave;

  // Snapshot of "what's last persisted to .md" (the manual save baseline)
  const [savedBaseline, setSavedBaseline] = useState(value);
  // For one-shot green flash
  const [savedFlash, setSavedFlash] = useState(false);
  const flashTimer = useRef<number | null>(null);
  const debounceTimer = useRef<number | null>(null);

  // Reset baseline if the value source changes from outside (e.g. switch chapter)
  const lastValueRef = useRef(value);
  useEffect(() => {
    if (value !== lastValueRef.current) {
      lastValueRef.current = value;
    }
  }, [value]);

  // Debounced autosave to IDB
  useEffect(() => {
    if (debounceTimer.current) {
      window.clearTimeout(debounceTimer.current);
    }
    if (value === savedBaseline) return; // nothing to save

    debounceTimer.current = window.setTimeout(() => {
      void onAutosave?.(value);
      debounceTimer.current = null;
    }, debounceMs);

    return () => {
      if (debounceTimer.current) {
        window.clearTimeout(debounceTimer.current);
      }
    };
  }, [value, savedBaseline, debounceMs, onAutosave]);

  const markSaved = useCallback((newBaseline: string) => {
    setSavedBaseline(newBaseline);
    setSavedFlash(true);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setSavedFlash(false), 1500);
  }, []);

  const resetBaseline = useCallback((b: string) => setSavedBaseline(b), []);

  const state: SaveState =
    savedFlash ? 'saved' : value === savedBaseline ? 'clean' : 'dirty';

  return { state, markSaved, resetBaseline };
}
