import type { ApiErrorBody, CreateNovelResponse } from "@novel-writer/shared-types";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { pickFolder } from "../../lib/folder-picker";
import { CharacterListInput } from "./CharacterListInput";
import { useNewProjectForm } from "./useNewProjectForm";

interface Props {
  onClose: () => void;
}

export function NewProjectDialog({ onClose }: Props) {
  const form = useNewProjectForm();
  const [submitting, setSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handlePickFolder() {
    const path = await pickFolder();
    if (path) form.setField("parentFolder", path);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setGlobalError(null);
    form.setFieldErrors({});
    try {
      const res = await fetch("/api/novels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form.toRequest()),
      });
      if (!res.ok) {
        const body = (await res.json()) as ApiErrorBody;
        if (body.fieldErrors) form.setFieldErrors(body.fieldErrors);
        setGlobalError(body.message);
        return;
      }
      const body = (await res.json()) as CreateNovelResponse;
      // After M1-B: route to /editor/created; M1-C will accept :hash param
      onClose();
      navigate(`/editor/created?path=${encodeURIComponent(body.project.path)}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">新小說（步驟 {form.state.step} / 3）</h2>
          <button type="button" onClick={onClose} className="text-sm text-gray-400">
            取消
          </button>
        </div>

        {form.state.step === 1 && (
          <div className="space-y-3">
            <label className="block">
              <span className="text-sm">書名</span>
              <input
                type="text"
                className="w-full mt-1 px-2 py-1 border rounded text-sm"
                value={form.state.title}
                onChange={(e) => form.setField("title", e.target.value)}
              />
              {form.state.fieldErrors["title"] && (
                <span className="text-xs text-red-600">{form.state.fieldErrors["title"]}</span>
              )}
            </label>
            <label className="block">
              <span className="text-sm">父資料夾</span>
              <div className="flex gap-2 mt-1">
                <input
                  type="text"
                  readOnly
                  placeholder="點「瀏覽」選擇"
                  className="flex-1 px-2 py-1 border rounded text-sm bg-gray-50"
                  value={form.state.parentFolder}
                />
                <button
                  type="button"
                  onClick={handlePickFolder}
                  className="px-3 py-1 border rounded text-sm"
                >
                  瀏覽
                </button>
              </div>
            </label>
          </div>
        )}

        {form.state.step === 2 && (
          <label className="block">
            <span className="text-sm">故事大綱（至少 10 字）</span>
            <textarea
              rows={6}
              className="w-full mt-1 px-2 py-1 border rounded text-sm resize-none"
              value={form.state.synopsis}
              onChange={(e) => form.setField("synopsis", e.target.value)}
            />
            {form.state.fieldErrors["synopsis"] && (
              <span className="text-xs text-red-600">{form.state.fieldErrors["synopsis"]}</span>
            )}
          </label>
        )}

        {form.state.step === 3 && (
          <div>
            <span className="text-sm mb-2 block">角色清單（至少一名）</span>
            <CharacterListInput
              value={form.state.characters}
              onChange={(next) => form.setField("characters", next)}
            />
          </div>
        )}

        {globalError && <div className="text-sm text-red-600">{globalError}</div>}

        <div className="flex justify-between pt-3 border-t">
          <button
            type="button"
            onClick={form.back}
            disabled={form.state.step === 1}
            className="px-3 py-1 text-sm border rounded disabled:opacity-30"
          >
            上一步
          </button>
          {form.state.step < 3 ? (
            <button
              type="button"
              onClick={form.advance}
              disabled={!form.canAdvance()}
              className="px-4 py-1 text-sm bg-blue-600 text-white rounded disabled:opacity-30"
            >
              下一步
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!form.canAdvance() || submitting}
              className="px-4 py-1 text-sm bg-blue-600 text-white rounded disabled:opacity-30"
            >
              {submitting ? "建立中…" : "建立"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
