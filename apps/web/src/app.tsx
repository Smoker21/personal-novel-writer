import { useEffect, useState } from "react";
import { RouterProvider } from "react-router-dom";
import { router } from "./router.js";

export function App() {
  const [ready, setReady] = useState(!import.meta.env.DEV || !import.meta.env["VITE_USE_MSW"]);

  useEffect(() => {
    if (!ready) {
      void import("./mocks/browser.js").then(({ mswWorker }) =>
        mswWorker.start({ onUnhandledRequest: "warn" }).then(() => setReady(true)),
      );
    }
  }, [ready]);

  if (!ready) return null;
  return <RouterProvider router={router} />;
}
