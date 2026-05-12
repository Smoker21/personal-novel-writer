import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error' | 'warn';
  text: string;
  ttlMs: number;
}

interface ToastCtx {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => void;
  pushSuccess: (text: string, ttlMs?: number) => void;
  pushError: (text: string, ttlMs?: number) => void;
  pushInfo: (text: string, ttlMs?: number) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    const full: Toast = { id, ...t };
    setToasts((cur) => [...cur, full]);
    window.setTimeout(() => {
      setToasts((cur) => cur.filter((x) => x.id !== id));
    }, t.ttlMs);
  }, []);

  const pushSuccess = useCallback(
    (text: string, ttlMs = 2500) => push({ kind: 'success', text, ttlMs }),
    [push],
  );
  const pushError = useCallback(
    (text: string, ttlMs = 4000) => push({ kind: 'error', text, ttlMs }),
    [push],
  );
  const pushInfo = useCallback(
    (text: string, ttlMs = 2500) => push({ kind: 'info', text, ttlMs }),
    [push],
  );

  return (
    <Ctx.Provider value={{ toasts, push, pushSuccess, pushError, pushInfo }}>
      {children}
      <ToastViewport toasts={toasts} />
    </Ctx.Provider>
  );
}

export function useToasts(): ToastCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToasts must be used inside <ToastProvider>');
  return v;
}

function ToastViewport({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={
            'pointer-events-auto px-4 py-3 rounded-btn shadow-lg fade-in min-w-[260px] max-w-[420px] text-sm ' +
            (t.kind === 'success'
              ? 'bg-status-saved text-white'
              : t.kind === 'error'
              ? 'bg-status-error text-white'
              : t.kind === 'warn'
              ? 'bg-status-warn text-white'
              : 'bg-ink-700 text-white')
          }
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
