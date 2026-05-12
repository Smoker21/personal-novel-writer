import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/Button';
import { putProject, putCharacter, putChapter, putStatus } from '@/storage/projectStore';
import { makeSlug } from '@/utils/slug';
import { useToasts } from '@/hooks/useToasts';
import type { Character } from '@/types';

interface InitChar {
  name: string;
  desc: string;
}

export function ProjectNew() {
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [chars, setChars] = useState<InitChar[]>([{ name: '', desc: '' }]);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const toasts = useToasts();

  const valid = name.trim() && path.trim();

  function setChar(i: number, patch: Partial<InitChar>) {
    setChars((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function addChar() {
    setChars((cs) => [...cs, { name: '', desc: '' }]);
  }
  function delChar(i: number) {
    setChars((cs) => cs.filter((_, idx) => idx !== i));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    const slug = makeSlug(name);
    const now = Date.now();

    await putProject({
      slug,
      name: name.trim(),
      path: path.trim(),
      synopsis: synopsis.trim(),
      createdAt: now,
      lastOpenedAt: now,
    });

    // initial empty chapter 1
    await putChapter({
      id: `${slug}-ch1`,
      projectSlug: slug,
      number: 1,
      title: '',
      content: '',
      status: 'draft',
      wordCount: 0,
      updatedAt: now,
    });

    // initial story status
    await putStatus({
      id: `${slug}:story`,
      projectSlug: slug,
      kind: 'story',
      content: `# 故事狀態\n\n## 主軸進展\n${synopsis.trim() || '（尚未填寫）'}\n\n## 🔖 伏筆\n（尚未填寫）\n\n## ✨ 轉折點\n（尚未填寫）\n`,
      updatedAt: now,
    });

    // initial characters
    for (const c of chars) {
      if (!c.name.trim()) continue;
      const cid = `${slug}-${makeSlug(c.name)}`;
      const ch: Character = {
        id: cid,
        projectSlug: slug,
        name: c.name.trim(),
        personalityTags: [],
        body: c.desc.trim(),
        manuallyEdited: false,
        createdAt: now,
        updatedAt: now,
      };
      await putCharacter(ch);
      await putStatus({
        id: `${slug}:char:${cid}`,
        projectSlug: slug,
        kind: 'character',
        charId: cid,
        content: `# ${c.name.trim()} — 角色狀態\n\n## 當下處境\n（尚未填寫）\n\n## 🔖 個人伏筆\n（尚未填寫）\n\n## ✨ 個人轉折點\n（尚未填寫）\n`,
        updatedAt: now,
      });
    }

    // Brief says: loading 1s feel before redirect
    await new Promise((r) => setTimeout(r, 800));
    toasts.pushSuccess(`已建立「${name}」`);
    navigate(`/p/${slug}`);
  }

  return (
    <div className="max-w-[640px] mx-auto px-6 py-12">
      <h1 className="text-2xl font-serif mb-1">建立新小說</h1>
      <p className="text-sm text-ink-500 dark:text-ink-300 mb-8">
        填一些基本資料，建完就能開始寫。每個欄位之後都可以再補。
      </p>

      <form onSubmit={onSubmit} className="space-y-6">
        <Field label="書名 *" hint="">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="春日記事"
            required
            className="w-full px-3 py-2 rounded border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800"
          />
        </Field>

        <Field label="存放位置 *" hint="（prototype：請貼一個 fake 路徑）">
          <div className="flex gap-2">
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="F:/novels/春日記事"
              required
              className="flex-1 px-3 py-2 rounded border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPath('F:/novels/' + (name || '新小說'))}
            >
              選擇資料夾
            </Button>
          </div>
        </Field>

        <Field label="故事大綱 (synopsis)" hint="(可之後補)">
          <textarea
            value={synopsis}
            onChange={(e) => setSynopsis(e.target.value)}
            placeholder="一段話描述這本小說的主軸"
            rows={4}
            className="w-full px-3 py-2 rounded border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800"
          />
        </Field>

        <div>
          <div className="text-xs font-medium text-ink-500 dark:text-ink-300 mb-2 flex items-center justify-between">
            <span>初始角色 <span className="text-ink-400">(可之後補)</span></span>
            <button
              type="button"
              onClick={addChar}
              className="text-accent hover:text-accent-hover text-xs"
            >
              + 加一位
            </button>
          </div>
          <div className="space-y-2">
            {chars.map((c, i) => (
              <div key={i} className="flex gap-2 items-start">
                <input
                  placeholder="名稱"
                  value={c.name}
                  onChange={(e) => setChar(i, { name: e.target.value })}
                  className="w-32 px-3 py-2 rounded border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 text-sm"
                />
                <input
                  placeholder="一句話描述"
                  value={c.desc}
                  onChange={(e) => setChar(i, { desc: e.target.value })}
                  className="flex-1 px-3 py-2 rounded border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 text-sm"
                />
                <button
                  type="button"
                  onClick={() => delChar(i)}
                  className="text-ink-400 hover:text-status-error px-2 py-2 text-sm"
                  aria-label="刪除"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 pt-4">
          <Button type="submit" variant="primary" size="lg" disabled={!valid} loading={busy}>
            ✨ 建立
          </Button>
          <Link to="/" className="text-sm text-ink-500 hover:text-ink-800 dark:hover:text-ink-100">
            取消
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-500 dark:text-ink-300 mb-1">
        {label} {hint && <span className="text-ink-400 font-normal">{hint}</span>}
      </label>
      {children}
    </div>
  );
}
