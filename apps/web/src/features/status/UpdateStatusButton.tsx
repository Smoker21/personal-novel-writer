import { useState } from "react";
import { useDraftStore } from "../../stores/draft-store";

interface Props {
  projectHash: string;
  chapterNumber: number;
}

export function UpdateStatusButton({ projectHash, chapterNumber }: Props) {
  const setStatusJobId = useDraftStore((s) => s.setStatusJobId);
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!confirm(`以第 ${chapterNumber} 章的內容重新跑 status-updater？`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectHash}/status/update-from-chapter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterNumber, reason: "manual" }),
      });
      if (res.ok) {
        const data = (await res.json()) as { jobId: string };
        setStatusJobId(data.jobId);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="rounded border border-neutral-600 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700 disabled:opacity-40 transition-colors"
    >
      {loading ? "更新中…" : "立刻更新狀態"}
    </button>
  );
}
