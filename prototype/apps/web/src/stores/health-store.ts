import { create } from "zustand";

interface HealthStore {
  status: "loading" | "ok" | "error";
  version: string | null;
  fetch: () => Promise<void>;
}

export const useHealthStore = create<HealthStore>((set) => ({
  status: "loading",
  version: null,
  fetch: async () => {
    try {
      const res = await fetch("/api/health");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { ok: boolean; version: string };
      set({ status: "ok", version: data.version });
    } catch {
      set({ status: "error" });
    }
  },
}));
