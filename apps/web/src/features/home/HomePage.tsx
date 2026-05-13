import type { AppSettings, OpenProjectResponse, RecentProject } from "@novel-writer/shared-types";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { pickFolder } from "../../lib/folder-picker";
import { BrowseFolderButton } from "./BrowseFolderButton";
import { MissingProjectDialog } from "./MissingProjectDialog";
import { NewProjectButton } from "./NewProjectButton";
import { RecentProjectsList } from "./RecentProjectsList";

export function HomePage() {
  const [recents, setRecents] = useState<RecentProject[]>([]);
  const [missingTarget, setMissingTarget] = useState<RecentProject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    void fetch("/api/settings")
      .then((r) => r.json() as Promise<AppSettings>)
      .then((s) => setRecents(s.recentProjects));
  }, []);

  async function handleRemoveMissing() {
    if (!missingTarget) return;
    await fetch("/api/projects/recent/remove", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hash: missingTarget.hash }),
    });
    setRecents(recents.filter((r) => r.hash !== missingTarget.hash));
    setMissingTarget(null);
  }

  async function handleRelocate() {
    if (!missingTarget) return;
    const newPath = await pickFolder();
    if (!newPath) return;
    const res = await fetch("/api/projects/recent/relocate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ oldHash: missingTarget.hash, newPath }),
    });
    if (!res.ok) {
      setError("重新指定路徑失敗");
      setMissingTarget(null);
      return;
    }
    const body = (await res.json()) as OpenProjectResponse;
    setMissingTarget(null);
    navigate(`/editor/${body.project.hash}`);
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="max-w-4xl mx-auto px-8 py-12">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-semibold">Novel Writer</h1>
          <Link
            to="/settings"
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            ⚙️ 設定
          </Link>
        </div>
        <p className="text-sm text-gray-500 mb-12">本機小說寫作工具</p>

        <div className="grid grid-cols-2 gap-12">
          <section>
            <h2 className="text-lg font-medium mb-4">開始</h2>
            <div className="flex flex-col gap-3">
              <NewProjectButton />
              <BrowseFolderButton onError={setError} />
            </div>
            {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
          </section>

          <section>
            <h2 className="text-lg font-medium mb-4">最近開啟</h2>
            {recents.length === 0 ? (
              <div className="text-center py-8 space-y-2 text-gray-400">
                <div className="text-4xl">📖</div>
                <p className="text-sm">還沒有小說專案</p>
                <p className="text-xs text-gray-500">點「新小說」開始創作</p>
              </div>
            ) : (
              <RecentProjectsList projects={recents} onMissing={setMissingTarget} />
            )}
          </section>
        </div>
      </div>

      {missingTarget && (
        <MissingProjectDialog
          path={missingTarget.path}
          onRemove={handleRemoveMissing}
          onRelocate={handleRelocate}
          onCancel={() => setMissingTarget(null)}
        />
      )}
    </div>
  );
}
