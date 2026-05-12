import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listRecentProjects } from '@/storage/projectStore';
import type { RecentProjectEntry } from '@/types';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { useToasts } from '@/hooks/useToasts';
import { formatRelativeTime } from '@/utils/time';

export function Home() {
  const [recent, setRecent] = useState<RecentProjectEntry[] | null>(null);
  const [openModal, setOpenModal] = useState(false);
  const [pastedPath, setPastedPath] = useState('');
  const navigate = useNavigate();
  const toasts = useToasts();

  useEffect(() => {
    void listRecentProjects().then(setRecent);
  }, []);

  function fakeOpenExisting() {
    if (!pastedPath.trim()) {
      toasts.pushError('請貼上資料夾路徑');
      return;
    }
    // Prototype: pretend we recognize "F:/novels/春日記事" → spring-diary
    setOpenModal(false);
    if (pastedPath.includes('春日記事') || pastedPath.endsWith('spring-diary')) {
      navigate('/p/spring-diary');
    } else {
      toasts.pushError('找不到對應的小說專案（試試 F:/novels/春日記事）');
    }
  }

  return (
    <div className="min-h-full">
      <div className="max-w-[720px] mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-serif text-accent dark:text-accent-light mb-2">
            Novel Writer
          </h1>
          <p className="text-ink-500 dark:text-ink-300 text-sm">
            個人本機小說撰寫助手
          </p>
        </div>

        <div className="flex justify-center gap-3 mb-12">
          <Link to="/projects/new">
            <Button variant="primary" size="lg" leftIcon="✨">
              新小說
            </Button>
          </Link>
          <Button variant="secondary" size="lg" onClick={() => setOpenModal(true)}>
            📂 開啟既有專案
          </Button>
        </div>

        <section>
          <h2 className="text-xs uppercase tracking-wider text-ink-400 mb-3 px-1">
            最近開啟
          </h2>
          {recent === null && (
            <div className="text-ink-400 text-sm">載入中…</div>
          )}
          {recent && recent.length === 0 && (
            <div className="text-ink-400 text-sm py-12 text-center border border-dashed border-ink-200 dark:border-ink-700 rounded-card">
              還沒有任何小說。從上面建立第一本吧。
            </div>
          )}
          <ul className="divide-y divide-ink-200 dark:divide-ink-700 border border-ink-200 dark:border-ink-700 rounded-card overflow-hidden bg-white dark:bg-ink-800">
            {recent?.map((p) => (
              <li key={p.slug}>
                <Link
                  to={`/p/${p.slug}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-ink-50 dark:hover:bg-ink-700/50 transition"
                >
                  <div className="min-w-0">
                    <div className="font-medium font-serif text-base">{p.name}</div>
                    <div className="text-xs text-ink-400 mt-0.5 truncate">{p.path}</div>
                  </div>
                  <div className="text-right text-xs text-ink-500 dark:text-ink-300 whitespace-nowrap">
                    <div>{formatRelativeTime(p.lastOpenedAt)}</div>
                    <div className="text-ink-400">{p.chapterCount} 章</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <div className="text-center mt-16">
          <Link to="/settings" className="text-xs text-ink-400 hover:text-ink-700 dark:hover:text-ink-200">
            ⚙ 設定
          </Link>
        </div>
      </div>

      <Modal
        open={openModal}
        onClose={() => setOpenModal(false)}
        title="開啟既有專案"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpenModal(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={fakeOpenExisting}>
              開啟
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-500 mb-3">
          （prototype：請貼上資料夾路徑模擬「選擇資料夾」）
        </p>
        <input
          autoFocus
          value={pastedPath}
          onChange={(e) => setPastedPath(e.target.value)}
          placeholder="F:/novels/春日記事"
          className="w-full px-3 py-2 rounded border border-ink-200 dark:border-ink-700 bg-ink-50 dark:bg-ink-900 text-sm"
        />
      </Modal>
    </div>
  );
}
