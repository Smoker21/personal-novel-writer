import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { ensureSeed } from './fake/seed';
import { ToastProvider } from './hooks/useToasts';
import { useDarkMode } from './hooks/useDarkMode';

export function App() {
  const [ready, setReady] = useState(false);
  // initialize dark mode side-effects on html
  useDarkMode();

  useEffect(() => {
    void ensureSeed().then(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <div className="h-full flex items-center justify-center text-ink-400 text-sm">
        正在載入…
      </div>
    );
  }

  return (
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  );
}
