/**
 * CharacterEditor — M5（Spec 002 Round 3）
 *
 * 結構：
 *   ├─ 核心區（永遠顯示）：portrait + 角色描述（手動）+ AI 統整敘述（摺疊）
 *   └─ 5 tabs：身分外貌 / 個性 / 對話 / 關係 / 性愛場景表現
 *
 * AI 統整流程：
 *   ✨ AI 統整 → aiSummary textarea 非空時彈確認 → POST consolidate → 寫入 textarea → 使用者按「儲存」才送 PUT
 *   失敗 → inline error 不擋其他按鈕
 */
import type { CharacterFields } from "@novel-writer/shared-types";
import { ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { ExpandableTextarea, Spinner } from "../../components";
import { PersonalityTagInput } from "./PersonalityTagInput";
import { PortraitSection } from "./PortraitSection";

type Tab = "身分外貌" | "個性" | "對話" | "關係" | "性愛場景表現";
const TABS: Tab[] = ["身分外貌", "個性", "對話", "關係", "性愛場景表現"];

const MBTI_OPTIONS = [
  "INTJ", "INTP", "ENTJ", "ENTP", "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ", "ISTP", "ISFP", "ESTP", "ESFP",
] as const;

const ZODIAC_OPTIONS = [
  "牡羊座", "金牛座", "雙子座", "巨蟹座", "獅子座", "處女座",
  "天秤座", "天蠍座", "射手座", "摩羯座", "水瓶座", "雙魚座",
] as const;

function emptyFields(name = ""): CharacterFields {
  return {
    name,
    age: null,
    gender: null,
    pronoun: null,
    role: null,
    personalityTags: [],
    mbti: null,
    zodiac: null,
    bloodType: null,
    culturalBackground: null,
    heightCm: null,
    bodyType: null,
    hairAndColor: null,
    eyes: null,
    otherFeatures: null,
    clothing: null,
    portrait: { default: null, byChapter: {} },
    appearanceByChapter: {},
    dialoguePace: null,
    wordingPreference: null,
    writingAvoid: null,
    relations: null,
    sexualScenePerformance: null,
    consolidatedAt: null,
    consolidatedBy: null,
    manuallyEditedSections: { manualDescription: false, aiSummary: false },
  };
}

interface Props {
  projectHash: string;
  slug: string | null;
  onSave: () => void;
  onClose: () => void;
  onDelete?: (slug: string) => void;
}

export function CharacterEditor({ projectHash, slug, onSave, onClose, onDelete }: Props) {
  const isNew = slug === null;
  const [activeTab, setActiveTab] = useState<Tab>("身分外貌");
  const [identityOpen, setIdentityOpen] = useState(false);
  const [aiSectionOpen, setAiSectionOpen] = useState(false);

  const [fields, setFields] = useState<CharacterFields>(emptyFields());
  const [manualDescription, setManualDescription] = useState("");
  const [aiSummary, setAiSummary] = useState("");

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [consolidating, setConsolidating] = useState(false);
  const [consolidateError, setConsolidateError] = useState<string | null>(null);
  const [overwriteDialog, setOverwriteDialog] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const upd = (patch: Partial<CharacterFields>) => setFields((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (isNew || !slug) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/projects/${projectHash}/characters/${slug}`)
      .then((r) => r.json() as Promise<{
        fields: CharacterFields;
        manualDescription: string;
        aiSummary: string;
      }>)
      .then((data) => {
        if (cancelled) return;
        setFields(data.fields);
        setManualDescription(data.manualDescription ?? "");
        setAiSummary(data.aiSummary ?? "");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectHash, slug, isNew, refreshKey]);

  const performConsolidate = async () => {
    if (!slug) return;
    setConsolidating(true);
    setConsolidateError(null);
    try {
      const res = await fetch(`/api/projects/${projectHash}/characters/${slug}/consolidate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = (await res.json()) as { code?: string; message?: string };
        setConsolidateError(`${err.code ?? "ERROR"}: ${err.message ?? "AI 統整失敗"}`);
        return;
      }
      const data = (await res.json()) as { aiSummary: string };
      setAiSummary(data.aiSummary);
      setAiSectionOpen(true);
    } catch (err) {
      setConsolidateError(err instanceof Error ? err.message : String(err));
    } finally {
      setConsolidating(false);
    }
  };

  const handleConsolidateClick = () => {
    if (aiSummary.trim().length > 0) {
      setOverwriteDialog(true);
      return;
    }
    void performConsolidate();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isNew) {
        await fetch(`/api/projects/${projectHash}/characters`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: fields.name, fields, manualDescription, aiSummary }),
        });
      } else {
        await fetch(`/api/projects/${projectHash}/characters/${slug}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fields, manualDescription, aiSummary }),
        });
      }
      onSave();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!slug) return;
    await fetch(`/api/projects/${projectHash}/characters/${slug}`, { method: "DELETE" });
    onDelete?.(slug);
    onClose();
  };

  if (loading) return <div className="p-6 text-sm text-neutral-400">載入中…</div>;

  return (
    <div className="flex h-full flex-col bg-neutral-950 text-neutral-100">
      {/* 核心區 — 永遠顯示 */}
      <div className="shrink-0 border-b border-neutral-800 bg-neutral-950 px-4 py-3">
        <div className="flex gap-4">
          <div className="w-32 shrink-0">
            {slug ? (
              <PortraitSection
                projectHash={projectHash}
                slug={slug}
                defaultPortraitPath={fields.portrait.default}
                onRefresh={() => setRefreshKey((k) => k + 1)}
              />
            ) : (
              <div className="rounded border border-dashed border-neutral-700 p-3 text-xs text-neutral-500">
                儲存後可上傳照片
              </div>
            )}
          </div>
          <div className="flex-1 space-y-3 min-w-0">
            <div className="space-y-1">
              <label className="text-xs font-medium text-neutral-400">
                ## 角色描述（手動）— chapter-writer 主要素材
              </label>
              <ExpandableTextarea
                value={manualDescription}
                onChange={setManualDescription}
                placeholder="在這裡寫下此角色的完整描述。不用擔心結構 — 可以是個性、外貌、口吻、習慣、過去、價值觀等任何重要資訊。chapter-writer 寫小說時主要看這段。"
                label="角色描述（手動）"
                ariaLabel="角色描述（手動）"
                minRowsInline={5}
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setAiSectionOpen((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-200"
                >
                  {aiSectionOpen ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                  ## AI 統整敘述
                  {fields.consolidatedAt && (
                    <span className="text-neutral-600">
                      （{fields.consolidatedBy ?? ""} · {fields.consolidatedAt.slice(0, 10)}）
                    </span>
                  )}
                </button>
                <div className="flex items-center gap-2">
                  {consolidating && <Spinner estimatedSeconds={15} />}
                  <button
                    type="button"
                    onClick={handleConsolidateClick}
                    disabled={consolidating || isNew}
                    title={isNew ? "請先儲存角色後再使用 AI 統整" : ""}
                    className="flex items-center gap-1 rounded border border-indigo-700 bg-indigo-900/40 px-2.5 py-1 text-xs text-indigo-200 hover:bg-indigo-800/60 disabled:opacity-40"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    AI 統整
                  </button>
                </div>
              </div>
              {consolidateError && (
                <div className="rounded border border-red-700/50 bg-red-950/30 px-2 py-1 text-xs text-red-300">
                  {consolidateError}
                </div>
              )}
              {aiSectionOpen && (
                <ExpandableTextarea
                  value={aiSummary}
                  onChange={setAiSummary}
                  placeholder="按上方「✨ AI 統整」會用結構化欄位 + 手動描述產生連貫敘述寫到這裡。可手動微調；下次 AI 統整不會蓋你的手動段。"
                  label="AI 統整敘述"
                  ariaLabel="AI 統整敘述"
                  minRowsInline={5}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 border-b border-neutral-800 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setActiveTab(t)}
            className={`whitespace-nowrap px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === t
                ? "border-b-2 border-indigo-500 text-indigo-400"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {activeTab === "身分外貌" && (
          <>
            <button
              type="button"
              onClick={() => setIdentityOpen((v) => !v)}
              className="flex items-center gap-2 text-xs font-medium text-neutral-300 hover:text-neutral-100"
            >
              {identityOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              身分（5 個欄位）
            </button>
            {identityOpen && (
              <div className="space-y-3 rounded border border-neutral-800 p-3">
                <Field label="姓名 *">
                  <input
                    value={fields.name}
                    onChange={(e) => upd({ name: e.target.value })}
                    placeholder="例：蘇晴"
                    className="input-base w-full"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="定位">
                    <select
                      value={fields.role ?? ""}
                      onChange={(e) => upd({ role: e.target.value || null })}
                      className="select-base w-full"
                    >
                      <option value="">未設定</option>
                      {["主角", "配角", "反派", "重要路人"].map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="年齡">
                    <input
                      type="number"
                      value={fields.age ?? ""}
                      onChange={(e) =>
                        upd({ age: e.target.value ? Number(e.target.value) : null })
                      }
                      placeholder="例：30"
                      className="input-base w-full"
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="性別">
                    <input
                      value={fields.gender ?? ""}
                      onChange={(e) => upd({ gender: e.target.value || null })}
                      placeholder="例：女 / 男 / 非二元 / 自由文字"
                      className="input-base w-full"
                    />
                  </Field>
                  <Field label="代名詞">
                    <input
                      value={fields.pronoun ?? ""}
                      onChange={(e) => upd({ pronoun: e.target.value || null })}
                      placeholder="例：她 / 他 / 牠 / 祂"
                      className="input-base w-full"
                    />
                  </Field>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="身高（cm）">
                <input
                  type="number"
                  value={fields.heightCm ?? ""}
                  onChange={(e) =>
                    upd({ heightCm: e.target.value ? Number(e.target.value) : null })
                  }
                  placeholder="例：165"
                  className="input-base w-full"
                />
              </Field>
              <Field label="體型">
                <input
                  value={fields.bodyType ?? ""}
                  onChange={(e) => upd({ bodyType: e.target.value || null })}
                  placeholder="例：中等偏瘦"
                  className="input-base w-full"
                />
              </Field>
            </div>
            <Field label="髮型髮色">
              <textarea
                value={fields.hairAndColor ?? ""}
                onChange={(e) => upd({ hairAndColor: e.target.value || null })}
                rows={2}
                placeholder="例：黑色長髮，平日綁低馬尾；前額有齊瀏海"
                className="textarea-base w-full"
              />
            </Field>
            <Field label="眼睛">
              <textarea
                value={fields.eyes ?? ""}
                onChange={(e) => upd({ eyes: e.target.value || null })}
                rows={2}
                placeholder="例：雙眼皮，眼尾微下垂；瞳色棕黑"
                className="textarea-base w-full"
              />
            </Field>
            <Field label="服裝">
              <textarea
                value={fields.clothing ?? ""}
                onChange={(e) => upd({ clothing: e.target.value || null })}
                rows={2}
                placeholder="例：日常穿針織衫 + 直筒褲；正式場合穿襯衫"
                className="textarea-base w-full"
              />
            </Field>
            <Field label="其他特徵">
              <textarea
                value={fields.otherFeatures ?? ""}
                onChange={(e) => upd({ otherFeatures: e.target.value || null })}
                rows={2}
                placeholder="例：膚色偏白，鵝蛋臉；左頸有顆小痣"
                className="textarea-base w-full"
              />
            </Field>
          </>
        )}

        {activeTab === "個性" && (
          <>
            <Field label="個性標籤">
              <PersonalityTagInput
                tags={fields.personalityTags}
                onChange={(tags) => upd({ personalityTags: tags })}
              />
              <p className="mt-1 text-xs text-neutral-600">
                按 Enter 新增。例：內向、敏感、含蓄、堅強、慢熱
              </p>
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="MBTI">
                <select
                  value={fields.mbti ?? ""}
                  onChange={(e) =>
                    upd({ mbti: (e.target.value || null) as CharacterFields["mbti"] })
                  }
                  className="select-base w-full"
                >
                  <option value="">未設定</option>
                  {MBTI_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="星座">
                <select
                  value={fields.zodiac ?? ""}
                  onChange={(e) =>
                    upd({ zodiac: (e.target.value || null) as CharacterFields["zodiac"] })
                  }
                  className="select-base w-full"
                >
                  <option value="">未設定</option>
                  {ZODIAC_OPTIONS.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="血型">
                <select
                  value={fields.bloodType ?? ""}
                  onChange={(e) =>
                    upd({
                      bloodType: (e.target.value || null) as CharacterFields["bloodType"],
                    })
                  }
                  className="select-base w-full"
                >
                  <option value="">未設定</option>
                  {["A", "B", "O", "AB"].map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="文化背景">
              <textarea
                value={fields.culturalBackground ?? ""}
                onChange={(e) => upd({ culturalBackground: e.target.value || null })}
                rows={3}
                placeholder="例：台灣台北出生長大，大學文學系；童年喪母由祖母帶大；信奉低調務實"
                className="textarea-base w-full"
              />
            </Field>
          </>
        )}

        {activeTab === "對話" && (
          <>
            <Field label="對話節奏">
              <select
                value={fields.dialoguePace ?? ""}
                onChange={(e) =>
                  upd({
                    dialoguePace: (e.target.value || null) as CharacterFields["dialoguePace"],
                  })
                }
                className="select-base w-full"
              >
                <option value="">未設定</option>
                <option value="快">快</option>
                <option value="穩">穩</option>
                <option value="慢">慢</option>
              </select>
            </Field>
            <Field label="用詞偏好">
              <textarea
                value={fields.wordingPreference ?? ""}
                onChange={(e) => upd({ wordingPreference: e.target.value || null })}
                rows={3}
                placeholder="例：半句話結尾，不喜歡把話說滿；對熟人會放鬆用語；不太用感嘆詞"
                className="textarea-base w-full"
              />
            </Field>
            <Field label="寫作要避免">
              <textarea
                value={fields.writingAvoid ?? ""}
                onChange={(e) => upd({ writingAvoid: e.target.value || null })}
                rows={3}
                placeholder="例：避免讓她說過於肯定的句子；不要寫她大笑；少用感嘆號"
                className="textarea-base w-full"
              />
            </Field>
          </>
        )}

        {activeTab === "關係" && (
          <Field label="與其他角色的關係（支援 [[wiki-link]]）">
            <textarea
              value={fields.relations ?? ""}
              onChange={(e) => upd({ relations: e.target.value || null })}
              rows={10}
              placeholder={"多行文字，可用 [[wiki-link]] 連結其他角色。例：\n與 [[林書言]] 從一場避雨開始認識，對他有具體好感但保持分寸。\n與 [[蕭母]] 是養育關係；母親早逝由祖母帶大，相依為命。"}
              className="textarea-base w-full"
            />
          </Field>
        )}

        {activeTab === "性愛場景表現" && (
          <div className="space-y-3">
            <div className="rounded border border-amber-700/50 bg-amber-950/20 p-3 text-xs text-amber-300">
              ⚠️ 此區內容會餵給 chapter-writer。題材不適用時請留空。
            </div>
            <Field label="身體數據">
              <textarea
                value={fields.sexualScenePerformance?.bodyMeasurements ?? ""}
                onChange={(e) =>
                  upd({
                    sexualScenePerformance: {
                      bodyMeasurements: e.target.value || null,
                      preferences: fields.sexualScenePerformance?.preferences ?? null,
                    },
                  })
                }
                rows={3}
                placeholder="例：B85 / W60 / H88，膚質細緻；題材不適用時請留空。"
                className="textarea-base w-full"
              />
            </Field>
            <Field label="偏好">
              <textarea
                value={fields.sexualScenePerformance?.preferences ?? ""}
                onChange={(e) =>
                  upd({
                    sexualScenePerformance: {
                      bodyMeasurements: fields.sexualScenePerformance?.bodyMeasurements ?? null,
                      preferences: e.target.value || null,
                    },
                  })
                }
                rows={3}
                placeholder="例：被動但會主動引導；喜歡眼神接觸；場景偏向慢節奏與情感醞釀；題材不適用時請留空。"
                className="textarea-base w-full"
              />
            </Field>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-between border-t border-neutral-800 px-4 py-3">
        <div>
          {!isNew &&
            (deleteConfirm ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-red-400">確定刪除？</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="text-red-400 hover:text-red-300"
                >
                  確認
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(false)}
                  className="text-neutral-400 hover:text-neutral-200"
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setDeleteConfirm(true)}
                className="text-xs text-red-500 hover:text-red-400"
              >
                刪除角色
              </button>
            ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-neutral-400 hover:text-neutral-200"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !fields.name.trim()}
            className="rounded bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            {saving ? "儲存中…" : "儲存"}
          </button>
        </div>
      </div>

      {/* AI 統整覆蓋確認 dialog */}
      {overwriteDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onMouseDown={() => setOverwriteDialog(false)}
        >
          <div
            className="max-w-md rounded-lg border border-neutral-700 bg-neutral-900 p-5 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <p className="mb-2 text-sm font-medium text-amber-300">⚠️ 覆蓋既有 AI 統整內容？</p>
            <p className="mb-3 text-sm text-neutral-300">
              「AI 統整敘述」textarea 目前有 {aiSummary.length} 字內容。新的 AI 統整結果會覆蓋這些內容。
            </p>
            <p className="mb-3 text-xs text-neutral-400">
              若上一次的結果你想保留，可：
              <br />• 取消後，先複製 textarea 內容到別處
              <br />• 或將該段內容移到「## 角色描述（手動）」
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOverwriteDialog(false)}
                className="rounded border border-neutral-600 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  setOverwriteDialog(false);
                  void performConsolidate();
                }}
                className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500"
              >
                覆蓋並重新統整
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-neutral-400">{label}</label>
      {children}
    </div>
  );
}
