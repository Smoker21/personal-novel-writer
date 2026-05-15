import type { CharacterFields } from "@novel-writer/shared-types";
import { useEffect, useState } from "react";
import { PersonalityTagInput } from "./PersonalityTagInput";

type Tab = "身分" | "個性" | "外貌" | "對話" | "關係" | "親密";
const TABS: Tab[] = ["身分", "個性", "外貌", "對話", "關係", "親密"];

const MBTI_OPTIONS = [
  "INTJ",
  "INTP",
  "ENTJ",
  "ENTP",
  "INFJ",
  "INFP",
  "ENFJ",
  "ENFP",
  "ISTJ",
  "ISFJ",
  "ESTJ",
  "ESFJ",
  "ISTP",
  "ISFP",
  "ESTP",
  "ESFP",
] as const;

const ZODIAC_OPTIONS = [
  "牡羊座",
  "金牛座",
  "雙子座",
  "巨蟹座",
  "獅子座",
  "處女座",
  "天秤座",
  "天蠍座",
  "射手座",
  "摩羯座",
  "水瓶座",
  "雙魚座",
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
    intimateAppendix: null,
    consolidatedAt: null,
    consolidatedBy: null,
    manuallyEdited: false,
  };
}

interface Props {
  projectHash: string;
  slug: string | null; // null = new character
  onSave: () => void;
  onClose: () => void;
  onDelete?: (slug: string) => void;
}

export function CharacterEditor({ projectHash, slug, onSave, onClose, onDelete }: Props) {
  const isNew = slug === null;
  const [activeTab, setActiveTab] = useState<Tab>("身分");
  const [fields, setFields] = useState<CharacterFields>(emptyFields());
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showIntimate, setShowIntimate] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const upd = (patch: Partial<CharacterFields>) => setFields((f) => ({ ...f, ...patch }));

  // Load existing character
  useEffect(() => {
    if (isNew || !slug) {
      setLoading(false);
      return;
    }
    fetch(`/api/projects/${projectHash}/characters/${slug}`)
      .then((r) => r.json())
      .then((data: { fields: CharacterFields; body: string }) => {
        setFields(data.fields);
        setBody(data.body);
      })
      .finally(() => setLoading(false));
  }, [projectHash, slug, isNew]);

  const handleGenerate = async () => {
    if (!slug) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/projects/${projectHash}/characters/${slug}/consolidate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("consolidate failed");
      const data = (await res.json()) as { body: string };
      setBody(data.body);
      upd({ manuallyEdited: false });
    } catch {
      // keep old body on failure
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isNew) {
        await fetch(`/api/projects/${projectHash}/characters`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: fields.name, fields }),
        });
      } else {
        await fetch(`/api/projects/${projectHash}/characters/${slug}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fields, body }),
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

  if (loading) return <div className="p-6 text-neutral-400 text-sm">載入中…</div>;

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex border-b border-neutral-700 overflow-x-auto shrink-0">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setActiveTab(t)}
            className={`px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === t
                ? "text-indigo-400 border-b-2 border-indigo-500"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === "身分" && (
          <>
            <Field label="姓名 *">
              <input
                value={fields.name}
                onChange={(e) => upd({ name: e.target.value })}
                className="input-base w-full"
                placeholder="角色姓名"
              />
            </Field>
            <Field label="角色定位">
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
            <div className="grid grid-cols-2 gap-3">
              <Field label="年齡">
                <input
                  type="number"
                  value={fields.age ?? ""}
                  onChange={(e) => upd({ age: e.target.value ? Number(e.target.value) : null })}
                  className="input-base w-full"
                />
              </Field>
              <Field label="性別">
                <input
                  value={fields.gender ?? ""}
                  onChange={(e) => upd({ gender: e.target.value || null })}
                  className="input-base w-full"
                  placeholder="male / female / 其他"
                />
              </Field>
            </div>
            <Field label="代名詞">
              <input
                value={fields.pronoun ?? ""}
                onChange={(e) => upd({ pronoun: e.target.value || null })}
                className="input-base w-full"
                placeholder="她 / 他 / 他們"
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
                    upd({ bloodType: (e.target.value || null) as CharacterFields["bloodType"] })
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
                className="textarea-base w-full"
              />
            </Field>
          </>
        )}

        {activeTab === "外貌" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="身高（cm）">
                <input
                  type="number"
                  value={fields.heightCm ?? ""}
                  onChange={(e) =>
                    upd({ heightCm: e.target.value ? Number(e.target.value) : null })
                  }
                  className="input-base w-full"
                />
              </Field>
              <Field label="體型">
                <input
                  value={fields.bodyType ?? ""}
                  onChange={(e) => upd({ bodyType: e.target.value || null })}
                  className="input-base w-full"
                  placeholder="中等偏瘦"
                />
              </Field>
            </div>
            <Field label="髮型與顏色">
              <textarea
                value={fields.hairAndColor ?? ""}
                onChange={(e) => upd({ hairAndColor: e.target.value || null })}
                rows={2}
                className="textarea-base w-full"
              />
            </Field>
            <Field label="眼睛">
              <textarea
                value={fields.eyes ?? ""}
                onChange={(e) => upd({ eyes: e.target.value || null })}
                rows={2}
                className="textarea-base w-full"
              />
            </Field>
            <Field label="其他特徵">
              <textarea
                value={fields.otherFeatures ?? ""}
                onChange={(e) => upd({ otherFeatures: e.target.value || null })}
                rows={2}
                className="textarea-base w-full"
              />
            </Field>
            <Field label="預設服裝風格">
              <textarea
                value={fields.clothing ?? ""}
                onChange={(e) => upd({ clothing: e.target.value || null })}
                rows={2}
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
                  upd({ dialoguePace: (e.target.value || null) as CharacterFields["dialoguePace"] })
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
                className="textarea-base w-full"
              />
            </Field>
            <Field label="寫作迴避">
              <textarea
                value={fields.writingAvoid ?? ""}
                onChange={(e) => upd({ writingAvoid: e.target.value || null })}
                rows={3}
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
              rows={8}
              className="textarea-base w-full"
            />
          </Field>
        )}

        {activeTab === "親密" && (
          <div className="space-y-4">
            <div className="rounded border border-amber-700/50 bg-amber-950/20 p-3 text-xs text-amber-400">
              此區段為成人場景描寫參考，僅在需要時填寫。
            </div>
            {!showIntimate ? (
              <button
                type="button"
                onClick={() => setShowIntimate(true)}
                className="text-sm text-neutral-400 hover:text-neutral-200"
              >
                展開親密描寫參考
              </button>
            ) : (
              <>
                <Field label="身體數據">
                  <textarea
                    value={fields.intimateAppendix?.bodyMeasurements ?? ""}
                    onChange={(e) =>
                      upd({
                        intimateAppendix: {
                          bodyMeasurements: e.target.value || null,
                          preferences: fields.intimateAppendix?.preferences ?? null,
                        },
                      })
                    }
                    rows={3}
                    className="textarea-base w-full"
                  />
                </Field>
                <Field label="偏好">
                  <textarea
                    value={fields.intimateAppendix?.preferences ?? ""}
                    onChange={(e) =>
                      upd({
                        intimateAppendix: {
                          bodyMeasurements: fields.intimateAppendix?.bodyMeasurements ?? null,
                          preferences: e.target.value || null,
                        },
                      })
                    }
                    rows={3}
                    className="textarea-base w-full"
                  />
                </Field>
              </>
            )}
          </div>
        )}
      </div>

      {/* Body + AI generate */}
      <div className="border-t border-neutral-700 p-4 space-y-2 shrink-0">
        <div className="flex items-center justify-between">
          <label className="text-xs text-neutral-400">AI 統整敘述</label>
          {fields.manuallyEdited && (
            <span className="text-xs text-amber-400">⚠ 下次 AI 生成將覆蓋你的修改</span>
          )}
        </div>
        <textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            upd({ manuallyEdited: true });
          }}
          rows={5}
          className="w-full rounded border border-neutral-600 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 resize-none"
        />
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || isNew}
          className="rounded bg-indigo-700 px-3 py-1.5 text-xs text-white hover:bg-indigo-600 disabled:opacity-40 transition-colors"
          title={isNew ? "請先儲存角色後再使用 AI 生成" : ""}
        >
          {generating ? "生成中…" : "AI 生成角色描述"}
        </button>
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center p-4 border-t border-neutral-700 shrink-0">
        <div>
          {!isNew &&
            (deleteConfirm ? (
              <div className="flex gap-2 items-center">
                <span className="text-xs text-red-400">確定刪除？</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  確認
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(false)}
                  className="text-xs text-neutral-400 hover:text-neutral-200"
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
            className="rounded bg-indigo-600 px-4 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors"
          >
            {saving ? "儲存中…" : "儲存"}
          </button>
        </div>
      </div>
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
