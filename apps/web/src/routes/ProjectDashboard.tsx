import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  getProject,
  listChapters,
  listCharacters,
  getStoryStatus,
  putChapter,
  countChars,
} from '@/storage/projectStore';
import type { Project, Chapter, Character, StatusDoc } from '@/types';
import { Button } from '@/components/Button';
import { ChapterStatusBadge } from '@/components/StatusBadge';
import { formatRelativeTime } from '@/utils/time';

export function ProjectDashboard() {
  const { slug = '' } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chars, setChars] = useState<Character[]>([]);
  const [story, setStory] = useState<StatusDoc | null>(null);

  useEffect(() => {
    void (async () => {
      const [p, ch, cs, st] = await Promise.all([
        getProject(slug),
        listChapters(slug),
        listCharacters(slug),
        getStoryStatus(slug),
      ]);
      setProject(p ?? null);
      setChapters(ch);
      setChars(cs);
      setStory(st ?? null);
    })();
  }, [slug]);

  if (!project) {
    return <div className="p-8 text-ink-400">載入中…</div>;
  }

  async function newChapter() {
    const next = (chapters.at(-1)?.number ?? 0) + 1;
    const id = `${slug}-ch${next}-${Date.now().toString(36)}`;
    await putChapter({
      id,
      projectSlug: slug,
      number: next,
      title: '',
      content: '',
      status: 'draft',
      wordCount: 0,
      updatedAt: Date.now(),
    });
    navigate(`/p/${slug}/chapters/${next}`);
  }

  const lastWritten = chapters.reduce<Chapter | null>(
    (acc, c) => (!acc || c.updatedAt > acc.updatedAt ? c : acc),
    null,
  );

  return (
    <div className="max-w-5xl mx-auto px-8 py-10">
      <header className="mb-10">
        <h1 className="text-3xl font-serif mb-2">{project.name}</h1>
        <p className="text-ink-500 dark:text-ink-300 text-sm leading-relaxed max-w-2xl">
          {project.synopsis || '（尚無故事大綱）'}
        </p>
        <p className="text-xs text-ink-400 mt-2">{project.path}</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        <Card icon="📖" title="章節" subtitle={`${chapters.length} 章 / ${lastWritten ? `上次寫到第 ${lastWritten.number} 章 ${formatRelativeTime(lastWritten.updatedAt)}` : '尚無章節'}`}>
          <Button variant="primary" size="sm" onClick={newChapter}>+ 新章節</Button>
        </Card>
        <Card icon="👤" title="角色" subtitle={`${chars.length} 位角色`}>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {chars.slice(0, 4).map((c) => (
              <Link
                key={c.id}
                to={`/p/${slug}/characters/${c.id}`}
                className="w-9 h-9 rounded-full bg-accent-subtle dark:bg-accent-dark/40 text-accent-dark dark:text-accent-subtle flex items-center justify-center text-xs font-medium hover:scale-105 transition"
                title={c.name}
              >
                {c.name.slice(0, 1)}
              </Link>
            ))}
          </div>
          <Link to={`/p/${slug}/characters`}>
            <Button variant="secondary" size="sm">+ 新增角色</Button>
          </Link>
        </Card>
        <Card icon="🧠" title="故事狀態" subtitle="">
          <div className="text-xs text-ink-500 dark:text-ink-300 line-clamp-3 mb-3 leading-relaxed whitespace-pre-wrap">
            {story?.content.split('\n').slice(0, 4).join('\n') || '（尚未寫入）'}
          </div>
          <Link to={`/p/${slug}/status/story`}>
            <Button variant="secondary" size="sm">展開檢視</Button>
          </Link>
        </Card>
      </div>

      <section>
        <h2 className="text-xs uppercase tracking-wider text-ink-400 mb-3 px-1">章節清單</h2>
        <ul className="divide-y divide-ink-200 dark:divide-ink-700 border border-ink-200 dark:border-ink-700 rounded-card overflow-hidden bg-white dark:bg-ink-800">
          {chapters.length === 0 && (
            <li className="px-5 py-6 text-ink-400 text-sm">尚無章節，點上方「+ 新章節」開始。</li>
          )}
          {chapters.map((ch) => (
            <li key={ch.id}>
              <Link
                to={`/p/${slug}/chapters/${ch.number}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-ink-50 dark:hover:bg-ink-700/50 transition"
              >
                <div className="w-12 text-center text-ink-400 text-sm">第 {ch.number} 章</div>
                <div className="flex-1 min-w-0">
                  <div className="font-serif">
                    {ch.title || <span className="text-ink-400">（未命名）</span>}
                  </div>
                  <div className="text-xs text-ink-400 mt-0.5">
                    {countChars(ch.content).toLocaleString()} 字 · {ch.savedAt ? formatRelativeTime(ch.savedAt) : '尚未儲存'}
                  </div>
                </div>
                <ChapterStatusBadge s={ch.status} />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Card({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-ink-200 dark:border-ink-700 rounded-card p-6 bg-white dark:bg-ink-800">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xl">{icon}</span>
        <h3 className="font-medium">{title}</h3>
      </div>
      {subtitle && <p className="text-xs text-ink-400 mb-4">{subtitle}</p>}
      {children}
    </div>
  );
}
