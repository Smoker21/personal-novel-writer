import { useCallback, useState } from "react";
import type { CreateNovelRequest } from "@novel-writer/shared-types";

export interface FormState {
  step: 1 | 2 | 3;
  title: string;
  parentFolder: string;
  synopsis: string;
  characters: Array<{ name: string; description: string }>;
  fieldErrors: Record<string, string>;
}

const INITIAL: FormState = {
  step: 1,
  title: "",
  parentFolder: "",
  synopsis: "",
  characters: [{ name: "", description: "" }],
  fieldErrors: {},
};

export function useNewProjectForm() {
  const [state, setState] = useState<FormState>(INITIAL);

  const setField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setState((s) => ({ ...s, [key]: value }));
  }, []);

  const setFieldErrors = useCallback((errors: Record<string, string>) => {
    setState((s) => ({ ...s, fieldErrors: errors }));
  }, []);

  const canAdvance = useCallback((): boolean => {
    if (state.step === 1) return state.title.trim() !== "" && state.parentFolder.trim() !== "";
    if (state.step === 2) return state.synopsis.trim().length >= 10;
    if (state.step === 3) {
      return state.characters.every(
        (c) => c.name.trim() !== "" && c.description.trim() !== "",
      );
    }
    return false;
  }, [state]);

  const advance = useCallback(() => {
    setState((s) => ({ ...s, step: Math.min(3, s.step + 1) as 1 | 2 | 3 }));
  }, []);

  const back = useCallback(() => {
    setState((s) => ({ ...s, step: Math.max(1, s.step - 1) as 1 | 2 | 3 }));
  }, []);

  const toRequest = useCallback((): CreateNovelRequest => {
    return {
      parentFolder: state.parentFolder,
      title: state.title.trim(),
      synopsis: state.synopsis.trim(),
      characters: state.characters.map((c) => ({
        name: c.name.trim(),
        description: c.description.trim(),
      })),
    };
  }, [state]);

  return { state, setField, setFieldErrors, canAdvance, advance, back, toRequest };
}
