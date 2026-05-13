import { create } from "zustand";

type View = "home" | "new-project" | "editor" | "settings";

interface UIStore {
  currentView: View;
  navigate: (view: View) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  currentView: "home",
  navigate: (view) => set({ currentView: view }),
}));
