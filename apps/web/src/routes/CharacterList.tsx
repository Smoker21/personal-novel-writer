import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { listCharacters, putCharacter } from '@/storage/projectStore';
import type { Character } from '@/types';
import { Button } from '@/components/Button';
import { makeSlug } from '@/utils/slug';

export function CharacterList() {
  const { slug = '' } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [chars, setChars] = useState<Character[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    void listCharacters(slug).then(setChars);
  }, [slug]);

  async function newCharacter() {
    const id = `${slug}-new-${Date.now().toString(36)}`;
    const now = Date.now();
    await putCharacter({
      id,
      projectSlug: slug,
      name: '新角色',
      personalityTags: [],
      body: '',
      manuallyEdited: false,
      createdAt: now,
      updatedAt: now,
    });
    navigate(`/p/${slug}/characters/${id}`);
  }

  const filtered = chars.filter((c) =>
    !q.trim() || c.name.includes(q) || (c.role ?? '').includes(q),
  );

  return (
    <div className="max-w-5xl mx-auto px-8 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-serif">角色</h1>
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜尋…"
            className="px-3 py-1.5 rounded border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 text-sm"
          />
          <Button variant="primary" size="sm" onClick={newCharacter}>+ 新角色</Button>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="text-ink-400 text-sm py-12 text-center border border-dashed border-ink-200 dark:border-ink-700 rounded-card">
          {q ? '沒有符合的角色' : '尚無角色，按右上「+ 新角色」開始。'}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((c) => (
          <Link
            key={c.id}
            to={`/p/${slug}/characters/${c.id}`}
            className="border border-ink-200 dark:border-ink-700 rounded-card p-5 bg-white dark:bg-ink-800 hover:border-accent transition group"
          >
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-accent-subtle dark:bg-accent-dark/40 text-accent-dark dark:text-accent-subtle flex items-center justify-center text-base font-medium shrink-0">
                {c.name.slice(0, 1)}
              </div>
              <div className="min-w-0">
                <div className="font-serif text-base">{c.name}</div>
                <div className="text-xs text-ink-400">{c.role || '—'} · {c.age ? `${c.age} 歲` : '—'}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1 mb-2">
              {c.personalityTags.slice(0, 4).map((t) => (
                <span key={t} className="text-[11px] px-1.5 py-0.5 rounded bg-ink-100 dark:bg-ink-700 text-ink-600 dark:text-ink-200">
                  {t}
                </span>
              ))}
            </div>
            <p className="text-xs text-ink-500 dark:text-ink-300 line-clamp-3 leading-relaxed">
              {c.body || '（尚未填寫描述）'}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
