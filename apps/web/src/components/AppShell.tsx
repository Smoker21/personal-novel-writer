import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getProject, touchProject } from '@/storage/projectStore';
import type { Project } from '@/types';
import { useDarkMode } from '@/hooks/useDarkMode';

/**
 * Two layouts in one shell:
 *  - Bare:   Home & Settings (top bar only, no sidebar)
 *  - Project: top bar + left sidebar
 *
 * We use Outlet so all routes get the top bar; the sidebar is conditional on
 * whether `:slug` exists in the route params.
 */
export function AppShell() {
  const { slug } = useParams<{ slug?: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [, , toggleDark] = useDarkMode();

  useEffect(() => {
    if (!slug) {
      setProject(null);
      return;
    }
    void (async () => {
      const p = await getProject(slug);
      if (p) {
        setProject(p);
        await touchProject(slug);
      } else {
        setProject(null);
      }
    })();
  }, [slug]);

  return (
    <div className="h-full flex flex-col bg-ink-50 dark:bg-ink-900">
      <TopBar projectName={project?.name} onToggleDark={toggleDark} />
      <div className="flex-1 flex overflow-hidden">
        {slug && <Sidebar slug={slug} />}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function TopBar({
  projectName,
  onToggleDark,
}: {
  projectName?: string;
  onToggleDark: () => void;
}) {
  return (
    <header className="h-12 px-4 flex items-center justify-between border-b border-ink-200 dark:border-ink-700 bg-ink-50 dark:bg-ink-800 shrink-0">
      <div className="flex items-center gap-3 text-sm">
        <Link to="/" className="font-semibold text-accent dark:text-accent-light">
          Novel Writer
        </Link>
        {projectName && (
          <>
            <span className="text-ink-300">/</span>
            <span className="text-ink-700 dark:text-ink-100">{projectName}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={onToggleDark}
          className="text-ink-500 hover:text-ink-800 dark:text-ink-300 dark:hover:text-ink-50 px-2 py-1 rounded"
          title="切換深色模式"
        >
          ◐
        </button>
        <Link
          to="/settings"
          className="text-ink-500 hover:text-ink-800 dark:text-ink-300 dark:hover:text-ink-50 px-2 py-1 rounded"
          title="設定"
        >
          ⚙
        </Link>
      </div>
    </header>
  );
}

function Sidebar({ slug }: { slug: string }) {
  const items = [
    { to: `/p/${slug}`, label: '專案', icon: '🏠', exact: true },
    { to: `/p/${slug}/chapters/1`, label: '章節', icon: '📖' },
    { to: `/p/${slug}/characters`, label: '角色', icon: '👤' },
    { to: `/p/${slug}/status/story`, label: '故事狀態', icon: '🧠' },
  ];
  return (
    <aside className="w-48 shrink-0 border-r border-ink-200 dark:border-ink-700 bg-ink-50 dark:bg-ink-800 px-3 py-4 flex flex-col gap-1 text-sm">
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.exact}
          className={({ isActive }) =>
            'flex items-center gap-2 px-2 py-2 rounded ' +
            (isActive
              ? 'bg-accent-subtle text-accent-dark dark:bg-accent-dark/40 dark:text-accent-subtle'
              : 'text-ink-700 dark:text-ink-200 hover:bg-ink-100 dark:hover:bg-ink-700')
          }
        >
          <span className="text-base">{it.icon}</span>
          <span>{it.label}</span>
        </NavLink>
      ))}
    </aside>
  );
}
