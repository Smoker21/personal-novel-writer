import { useEffect, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  width?: number;
}

export function Drawer({ open, onClose, title, children, width = 480 }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <aside
        className="absolute top-0 right-0 h-full bg-ink-50 dark:bg-ink-800 shadow-2xl drawer-in flex flex-col"
        style={{ width: `${width}px`, maxWidth: '100vw', transition: 'width 220ms ease-out' }}
      >
        {title && (
          <header className="px-5 py-4 border-b border-ink-200 dark:border-ink-700 flex items-center justify-between">
            <div className="font-medium text-sm">{title}</div>
            <button
              onClick={onClose}
              className="text-ink-400 hover:text-ink-700 dark:hover:text-ink-100 text-lg leading-none px-1"
              aria-label="關閉"
            >
              ×
            </button>
          </header>
        )}
        <div className="flex-1 overflow-hidden">{children}</div>
      </aside>
    </div>
  );
}
