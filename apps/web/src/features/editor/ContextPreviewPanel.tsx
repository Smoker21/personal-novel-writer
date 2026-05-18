import type { ChapterFile } from "@novel-writer/shared-types";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

interface Props {
  projectHash: string;
  chapterNumber: number;
  participants: string[];
}

interface SectionData {
  status: "loading" | "missing" | "ok";
  content: string;
}

async function fetchProjectFile(projectHash: string, path: string): Promise<string | null> {
  const res = await fetch(`/api/projects/${projectHash}/file?path=${encodeURIComponent(path)}`);
  if (!res.ok) return null;
  return res.text();
}

async function fetchPrevChapter(
  projectHash: string,
  chapterNumber: number,
): Promise<{ title: string; content: string } | null> {
  if (chapterNumber <= 1) return null;
  const res = await fetch(`/api/projects/${projectHash}/chapters/${chapterNumber - 1}`);
  if (!res.ok) return null;
  const ch = (await res.json()) as ChapterFile;
  return { title: ch.title, content: ch.content };
}

function truncate(s: string, limit = 200): { preview: string; full: string; truncated: boolean } {
  if (s.length <= limit) return { preview: s, full: s, truncated: false };
  return { preview: `${s.slice(0, limit)}…`, full: s, truncated: true };
}

export function ContextPreviewPanel({ projectHash, chapterNumber, participants }: Props) {
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-900/50">
      <button
        type="button"
        onClick={() => setPanelOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-neutral-300 hover:bg-neutral-800"
      >
        {panelOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        上下文預覽
        <span className="text-xs text-neutral-500">
          （前章 + story_status + {participants.length} 位參與角色）
        </span>
      </button>
      {panelOpen && (
        <div className="space-y-2 border-t border-neutral-800 px-3 py-3">
          <PrevChapterSection projectHash={projectHash} chapterNumber={chapterNumber} />
          <StoryStatusSection projectHash={projectHash} />
          {participants.length === 0 ? (
            <p className="text-xs text-neutral-500">（未選參與角色，無 character_status 預覽）</p>
          ) : (
            participants.map((slug) => (
              <CharacterStatusSection key={slug} projectHash={projectHash} slug={slug} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SectionShell({
  title,
  data,
  fallback,
}: {
  title: string;
  data: SectionData | null;
  fallback: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!data || data.status === "loading") {
    return (
      <div className="text-xs text-neutral-500">
        <span className="font-medium text-neutral-400">{title}</span> — 載入中…
      </div>
    );
  }
  if (data.status === "missing") {
    return (
      <div className="text-xs">
        <span className="font-medium text-neutral-400">{title}</span>{" "}
        <span className="text-neutral-500">— {fallback}</span>
      </div>
    );
  }
  const { preview, full, truncated } = truncate(data.content);
  return (
    <div className="space-y-1 text-xs">
      <div className="font-medium text-neutral-300">
        {title} <span className="text-neutral-500">（{data.content.length} 字）</span>
      </div>
      <pre className="whitespace-pre-wrap rounded bg-neutral-950 px-2 py-1.5 text-neutral-200">
        {expanded ? full : preview}
      </pre>
      {truncated && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-indigo-400 hover:text-indigo-300"
        >
          {expanded ? "收回" : "展開全部"}
        </button>
      )}
    </div>
  );
}

function PrevChapterSection({
  projectHash,
  chapterNumber,
}: {
  projectHash: string;
  chapterNumber: number;
}) {
  const [data, setData] = useState<SectionData | null>(null);
  const [title, setTitle] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    setData({ status: "loading", content: "" });
    void fetchPrevChapter(projectHash, chapterNumber).then((res) => {
      if (cancelled) return;
      if (!res) {
        setData({ status: "missing", content: "" });
        return;
      }
      setTitle(res.title);
      setData({ status: "ok", content: res.content });
    });
    return () => {
      cancelled = true;
    };
  }, [projectHash, chapterNumber]);
  const fallback = chapterNumber <= 1 ? "（本章為第一章）" : "（前章不存在）";
  return (
    <SectionShell
      title={
        title
          ? `前一章：第 ${chapterNumber - 1} 章「${title}」`
          : `前一章（第 ${chapterNumber - 1} 章）`
      }
      data={data}
      fallback={fallback}
    />
  );
}

function StoryStatusSection({ projectHash }: { projectHash: string }) {
  const [data, setData] = useState<SectionData | null>(null);
  useEffect(() => {
    let cancelled = false;
    setData({ status: "loading", content: "" });
    void fetchProjectFile(projectHash, "status/story_status.md").then((text) => {
      if (cancelled) return;
      setData(text ? { status: "ok", content: text } : { status: "missing", content: "" });
    });
    return () => {
      cancelled = true;
    };
  }, [projectHash]);
  return (
    <SectionShell
      title="故事狀態（story_status.md）"
      data={data}
      fallback="（尚無 story_status，第一章採用後生成）"
    />
  );
}

function CharacterStatusSection({ projectHash, slug }: { projectHash: string; slug: string }) {
  const [data, setData] = useState<SectionData | null>(null);
  useEffect(() => {
    let cancelled = false;
    setData({ status: "loading", content: "" });
    void fetchProjectFile(projectHash, `characters/${slug}_status.md`).then((text) => {
      if (cancelled) return;
      setData(text ? { status: "ok", content: text } : { status: "missing", content: "" });
    });
    return () => {
      cancelled = true;
    };
  }, [projectHash, slug]);
  return (
    <SectionShell
      title={`${slug}_status.md`}
      data={data}
      fallback="（尚無 status；新角色或前幾章未採用）"
    />
  );
}
