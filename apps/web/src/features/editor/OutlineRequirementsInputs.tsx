import { ExpandableTextarea } from "../../components";
import { useEditorStore } from "../../stores/editor-store";

const OUTLINE_PLACEHOLDER =
  "例：春雨在圖書館找到明哲，請他協助查詢《梅雨草稿》借閱歷史。明哲在館藏系統發現該書曾被列為「待處理」，留下伏筆。";

const REQUIREMENTS_PLACEHOLDER =
  "例：約 1500 字。第三人稱有限視角（以春雨為主）。保留書卷氣的文藝風格；不要過度推進感情線。";

export function OutlineInput() {
  const outline = useEditorStore((s) => s.outline);
  const setOutline = useEditorStore((s) => s.setOutline);
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-neutral-400">本章劇情大綱</label>
      <ExpandableTextarea
        value={outline ?? ""}
        onChange={(v) => setOutline(v === "" ? null : v)}
        placeholder={OUTLINE_PLACEHOLDER}
        label="本章劇情大綱"
        ariaLabel="本章劇情大綱"
        minRowsInline={4}
      />
    </div>
  );
}

export function RequirementsInput() {
  const requirements = useEditorStore((s) => s.requirements);
  const setRequirements = useEditorStore((s) => s.setRequirements);
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-neutral-400">本章寫作需求</label>
      <ExpandableTextarea
        value={requirements ?? ""}
        onChange={(v) => setRequirements(v === "" ? null : v)}
        placeholder={REQUIREMENTS_PLACEHOLDER}
        label="本章寫作需求"
        ariaLabel="本章寫作需求"
        minRowsInline={4}
      />
    </div>
  );
}
