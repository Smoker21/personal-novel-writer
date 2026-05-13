import type { AppSettings } from "@novel-writer/shared-types";
import { useEffect, useState } from "react";

export function FirstLaunchWarningDialog() {
  const [acknowledged, setAcknowledged] = useState<boolean | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    void fetch("/api/settings")
      .then((r) => r.json() as Promise<AppSettings>)
      .then((s) => {
        setSettings(s);
        setAcknowledged(s.meta.firstLaunchWarningAcknowledged);
      });
  }, []);

  async function handleAcknowledge() {
    if (!settings) return;
    const next = {
      ...settings,
      meta: { ...settings.meta, firstLaunchWarningAcknowledged: true },
    };
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    });
    setAcknowledged(true);
  }

  async function handleQuit() {
    if ("__TAURI_INTERNALS__" in window) {
      const tauri = await import("@tauri-apps/api/webviewWindow");
      const win = tauri.getCurrentWebviewWindow();
      await win.close();
    } else {
      window.close();
    }
  }

  if (acknowledged !== false) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg p-6 max-w-md space-y-4">
        <h2 className="text-lg font-semibold">使用前須知</h2>
        <ul className="text-sm space-y-2 list-disc ml-5">
          <li>Novel Writer 是個人本機工具，無雲端帳號，無資料同步服務。</li>
          <li>你的小說內容存在你選擇的資料夾，包含 git 版本歷史。</li>
          <li>
            請定期備份：git push 到遠端、Google Drive / iCloud / OneDrive 同步該資料夾，或外接硬碟。
          </li>
          <li>如資料夾遺失，本應用無法復原。</li>
        </ul>
        <div className="flex flex-col gap-2 pt-3 border-t">
          <button
            type="button"
            onClick={handleAcknowledge}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm"
          >
            我已了解，不再顯示
          </button>
          <button type="button" onClick={handleQuit} className="px-4 py-2 border rounded text-sm">
            離開應用
          </button>
        </div>
      </div>
    </div>
  );
}
