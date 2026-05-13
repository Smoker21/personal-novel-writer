import { useEffect, useState } from "react";
import type { ApiErrorBody, SaveChapterResponse } from "@novel-writer/shared-types";
import { deleteDraft } from "../../lib/db.js";
import { useEditorStore } from "../../stores/editor-store.js";

interface Props {
  getContent: () => string;
  onConflict: (serverContent: string) => Promise<void>;
  /** 父元件可透過此 callback 取得 performSave 函式，用於 Ctrl+S 快捷鍵觸發 */
  onSaveTriggerRef?: (trigger: () => void) => void;
}

export function SaveButton({ getContent, onConflict, onSaveTriggerRef }: Props) {
  const store = useEditorStore();
  const [saving, setSaving] = useState(false);

  // 把 performSave 暴露給父元件（供 Ctrl+S keymap 呼叫）
  useEffect(() => {
    if (onSaveTriggerRef) {
      onSaveTriggerRef(() => void performSave(false));
    }
    // onSaveTriggerRef 本身在渲染間不會改變，performSave 是 stable closure
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function performSave(force = false): Promise<void> {
    if (!store.projectHash || !store.chapter) return;
    if (store.chapter.title.trim() === "") {
      const t = window.prompt("請輸入章節標題");
      if (!t) return;
      store.setTitle(t);
    }
    setSaving(true);
    try {
      const content = getContent();
      const res = await fetch(
        `/api/projects/${store.projectHash}/chapters/${store.chapter.number}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            content,
            title: store.chapter.title.trim(),
            ...(force ? {} : { expectedMtime: store.chapter.baseMtime }),
          }),
        },
      );
      if (res.status === 409) {
        // fetch server fresh content
        const fresh = await fetch(
          `/api/projects/${store.projectHash}/chapters/${store.chapter.number}`,
        );
        if (fresh.ok) {
          const body = (await fresh.json()) as { content: string };
          await onConflict(body.content);
        }
        return;
      }
      if (!res.ok) {
        const body = (await res.json()) as ApiErrorBody;
        store.markSaveError(body.message);
        return;
      }
      const body = (await res.json()) as SaveChapterResponse;
      await deleteDraft(store.projectHash, store.chapter.number);
      store.markClean(body.mtime, content, store.chapter.title.trim());
    } catch (err) {
      store.markSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => performSave(false)}
      disabled={saving}
      className="px-4 py-1 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
    >
      {saving ? "儲存中…" : "儲存"}
    </button>
  );
}
