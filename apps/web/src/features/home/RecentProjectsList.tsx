import { useNavigate } from "react-router-dom";
import type { OpenProjectResponse, RecentProject } from "@novel-writer/shared-types";

interface Props {
  projects: RecentProject[];
  onMissing: (project: RecentProject) => void;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "剛才";
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  return `${Math.floor(hr / 24)} 天前`;
}

export function RecentProjectsList({ projects, onMissing }: Props) {
  const navigate = useNavigate();

  if (projects.length === 0) {
    return (
      <div className="text-sm text-gray-500 p-4 border rounded border-dashed">
        尚無最近開啟的專案。點「新小說」開始第一本，或「瀏覽資料夾」開啟既有專案。
      </div>
    );
  }

  async function handleOpen(p: RecentProject) {
    const res = await fetch("/api/projects/open", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: p.path, source: "recent-list" }),
    });
    if (res.status === 404) {
      onMissing(p);
      return;
    }
    if (!res.ok) return;
    const body = (await res.json()) as OpenProjectResponse;
    navigate(`/editor/${body.project.hash}`);
  }

  return (
    <ul className="space-y-2">
      {projects.map((p) => (
        <li key={p.hash}>
          <button
            type="button"
            onClick={() => handleOpen(p)}
            className="w-full text-left p-3 border rounded hover:bg-gray-50"
          >
            <div className="font-medium text-sm">{p.title}</div>
            <div className="text-xs text-gray-500 truncate">{p.path}</div>
            <div className="text-xs text-gray-400 mt-1">{timeAgo(p.lastOpenedAt)}</div>
          </button>
        </li>
      ))}
    </ul>
  );
}
