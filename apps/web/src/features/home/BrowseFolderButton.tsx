import type { OpenProjectResponse } from "@novel-writer/shared-types";
import { useNavigate } from "react-router-dom";
import { pickFolder } from "../../lib/folder-picker.js";

interface Props {
  onError?: (msg: string) => void;
}

export function BrowseFolderButton({ onError }: Props) {
  const navigate = useNavigate();

  async function handleClick() {
    const path = await pickFolder();
    if (!path) return;
    const res = await fetch("/api/projects/open", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path, source: "browse" }),
    });
    if (!res.ok) {
      const body = (await res.json()) as { message: string };
      onError?.(body.message);
      return;
    }
    const body = (await res.json()) as OpenProjectResponse;
    navigate(`/editor/${body.project.hash}`);
  }

  return (
    <button type="button" onClick={handleClick} className="px-4 py-2 border rounded text-sm">
      瀏覽資料夾…
    </button>
  );
}
