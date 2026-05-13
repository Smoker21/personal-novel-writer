import { useEffect } from "react";

export function useWindowFocusEffect(callback: () => void): void {
  useEffect(() => {
    window.addEventListener("focus", callback);
    return () => window.removeEventListener("focus", callback);
  }, [callback]);
}
