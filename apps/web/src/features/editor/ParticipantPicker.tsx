import type { CharacterListItem, ChapterFile } from "@novel-writer/shared-types";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { PortraitCard, PortraitGrid } from "../../components";
import { useEditorStore } from "../../stores/editor-store";

interface Props {
  projectHash: string;
  chapterNumber: number;
}

export function ParticipantPicker({ projectHash, chapterNumber }: Props) {
  const participants = useEditorStore((s) => s.participants);
  const setParticipants = useEditorStore((s) => s.setParticipants);
  const baseParticipants = useEditorStore((s) => s.chapter?.baseParticipants);
  const [characters, setCharacters] = useState<CharacterListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetch(`/api/projects/${projectHash}/characters`)
      .then((r) => r.json() as Promise<{ characters: CharacterListItem[] }>)
      .then((d) => {
        if (!cancelled) setCharacters(d.characters);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [projectHash]);

  // 預設選取：當 base 為空 + 章節 > 1 + 當前 participants 也空 → 抓上一章 participants
  useEffect(() => {
    if (
      chapterNumber > 1 &&
      participants.length === 0 &&
      (!baseParticipants || baseParticipants.length === 0)
    ) {
      void fetch(`/api/projects/${projectHash}/chapters/${chapterNumber - 1}`)
        .then((r) => (r.ok ? (r.json() as Promise<ChapterFile>) : null))
        .then((ch) => {
          if (ch?.participants.length) setParticipants(ch.participants);
        })
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectHash, chapterNumber]);

  const toggle = (slug: string) => {
    if (participants.includes(slug)) {
      setParticipants(participants.filter((p) => p !== slug));
    } else {
      setParticipants([...participants, slug]);
    }
  };

  if (error) {
    return <p className="text-xs text-red-400">載入角色失敗：{error}</p>;
  }
  if (characters === null) {
    return <p className="text-xs text-neutral-500">載入角色中…</p>;
  }
  if (characters.length === 0) {
    return (
      <p className="text-xs text-neutral-500">
        尚無角色卡。
        <Link
          to={`/editor/${projectHash}/characters`}
          className="ml-1 text-indigo-400 hover:text-indigo-300"
        >
          + 新建角色
        </Link>
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-neutral-400">
        <span className="font-medium">本章角色</span>
        <span className="text-neutral-500">
          {participants.length === 0 ? "（未選；只有列出的角色會塞進 prompt）" : `已選 ${participants.length} 位`}
        </span>
      </div>
      <PortraitGrid>
        {characters.map((c) => (
          <PortraitCard
            key={c.slug}
            projectHash={projectHash}
            data={{
              slug: c.slug,
              name: c.name,
              role: c.role,
              portraitDefault: c.portraitDefault,
            }}
            variant="select"
            selected={participants.includes(c.slug)}
            onClick={() => toggle(c.slug)}
          />
        ))}
      </PortraitGrid>
    </div>
  );
}
