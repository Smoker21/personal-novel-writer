import type { CreateNovelRequest } from "@novel-writer/shared-types";
import { useCallback, useState } from "react";

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
      return state.characters.every((c) => c.name.trim() !== "" && c.description.trim() !== "");
    }
    return false;
  }, [state]);

  const getBlockReason = useCallback((): string => {
    if (state.step === 1) {
      const missing: string[] = [];
      if (state.title.trim() === "") missing.push("書名");
      if (state.parentFolder.trim() === "") missing.push("父資料夾");
      return missing.length > 0 ? `請填寫：${missing.join("、")}` : "";
    }
    if (state.step === 2) {
      const len = state.synopsis.trim().length;
      if (len === 0) return "請填寫故事簡介";
      if (len < 10) return `故事簡介至少 10 字（目前 ${len} 字）`;
      return "";
    }
    if (state.step === 3) {
      const incomplete = state.characters
        .map((c, i) => {
          const missing: string[] = [];
          if (c.name.trim() === "") missing.push("姓名");
          if (c.description.trim() === "") missing.push("描述");
          return missing.length > 0 ? `角色 ${i + 1}：${missing.join("、")}` : "";
        })
        .filter(Boolean);
      return incomplete.length > 0 ? `請完成：${incomplete.join("；")}` : "";
    }
    return "";
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

  return {
    state,
    setField,
    setFieldErrors,
    canAdvance,
    getBlockReason,
    advance,
    back,
    toRequest,
  };
}
