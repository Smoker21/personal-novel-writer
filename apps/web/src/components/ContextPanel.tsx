import { useState } from 'react';
import type { Qwen3Params } from '@/types';
import { DEFAULT_QWEN3_PARAMS } from '@/types';

// ---- Accordion section ----

function AccordionSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-ink-200 dark:border-ink-700">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-ink-600 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-ink-700/50 transition-colors"
      >
        <span>{title}</span>
        <span className="text-ink-400 dark:text-ink-500 text-[10px] ml-2">
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open && <div className="px-4 pb-3 text-xs text-ink-700 dark:text-ink-200">{children}</div>}
    </div>
  );
}

// ---- Param slider ----

function ParamSlider({
  label,
  description,
  value,
  min,
  max,
  step,
  defaultValue,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-0.5">
        <label className="text-xs font-medium text-ink-700 dark:text-ink-200">{label}</label>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono text-accent dark:text-accent-subtle">{value}</span>
          <button
            type="button"
            onClick={() => onChange(defaultValue)}
            title="重設"
            className="text-[10px] text-ink-400 hover:text-ink-600 dark:hover:text-ink-200 underline leading-none"
          >
            重設
          </button>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full accent-green-700 cursor-pointer"
      />
      <p className="text-[11px] text-ink-400 dark:text-ink-500 mt-0.5 leading-snug">{description}</p>
    </div>
  );
}

// ---- Param number input ----

function ParamNumber({
  label,
  description,
  value,
  min,
  max,
  defaultValue,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  defaultValue: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-0.5">
        <label className="text-xs font-medium text-ink-700 dark:text-ink-200">{label}</label>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={min}
            max={max}
            value={value}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
            }}
            className="w-20 text-xs font-mono text-right border border-ink-200 dark:border-ink-600 rounded px-1.5 py-0.5 bg-white dark:bg-ink-800 text-ink-700 dark:text-ink-200 focus:outline-none focus:ring-1 focus:ring-accent/40"
          />
          <button
            type="button"
            onClick={() => onChange(defaultValue)}
            title="重設"
            className="text-[10px] text-ink-400 hover:text-ink-600 dark:hover:text-ink-200 underline leading-none"
          >
            重設
          </button>
        </div>
      </div>
      <p className="text-[11px] text-ink-400 dark:text-ink-500 mt-0.5 leading-snug">{description}</p>
    </div>
  );
}

// ---- Main ContextPanel ----

export interface ContextPanelProps {
  synopsis: string;
  characters: Array<{ name: string; bodySnippet: string }>;
  prevChapterTail: string;
  storyStatusSnippet: string;
  writingRequirements: string;
  onWritingRequirementsChange: (v: string) => void;
  params: Qwen3Params;
  onParamsChange: (p: Qwen3Params) => void;
}

export function ContextPanel({
  synopsis,
  characters,
  prevChapterTail,
  storyStatusSnippet,
  writingRequirements,
  onWritingRequirementsChange,
  params,
  onParamsChange,
}: ContextPanelProps) {
  const [paramsOpen, setParamsOpen] = useState(false);

  function set<K extends keyof Qwen3Params>(key: K, value: Qwen3Params[K]) {
    onParamsChange({ ...params, [key]: value });
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto text-sm">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-ink-200 dark:border-ink-700 shrink-0">
        <span className="text-xs font-semibold text-ink-500 dark:text-ink-300 uppercase tracking-wide">
          上下文 &amp; 參數
        </span>
      </div>

      {/* Synopsis */}
      <AccordionSection title="故事大綱（Synopsis）">
        {synopsis ? (
          <p className="whitespace-pre-wrap leading-relaxed text-ink-600 dark:text-ink-300">
            {synopsis}
          </p>
        ) : (
          <p className="text-ink-400 italic">（尚無大綱）</p>
        )}
      </AccordionSection>

      {/* Characters */}
      <AccordionSection title={`角色卡（Characters）${characters.length > 0 ? ` ×${characters.length}` : ''}`}>
        {characters.length === 0 ? (
          <p className="text-ink-400 italic">（尚無角色）</p>
        ) : (
          <div className="space-y-2">
            {characters.map((c) => (
              <CharacterRow key={c.name} name={c.name} bodySnippet={c.bodySnippet} />
            ))}
          </div>
        )}
      </AccordionSection>

      {/* Prev chapter tail */}
      <AccordionSection title="上一章結尾（Prev Chapter）">
        {prevChapterTail ? (
          <p className="whitespace-pre-wrap leading-relaxed text-ink-600 dark:text-ink-300">
            {prevChapterTail}
          </p>
        ) : (
          <p className="text-ink-400 italic">（第一章，無上一章）</p>
        )}
      </AccordionSection>

      {/* Story status */}
      <AccordionSection title="故事狀態摘要（Story Status）">
        {storyStatusSnippet ? (
          <p className="whitespace-pre-wrap leading-relaxed text-ink-600 dark:text-ink-300">
            {storyStatusSnippet}
          </p>
        ) : (
          <p className="text-ink-400 italic">（尚無故事狀態）</p>
        )}
      </AccordionSection>

      {/* Writing requirements — editable */}
      <AccordionSection title="本章寫作需求（Writing Requirements）">
        <textarea
          value={writingRequirements}
          onChange={(e) => onWritingRequirementsChange(e.target.value)}
          placeholder="本章想寫什麼？有什麼特別要求？（選填）例：這章要讓蘇晴第一次主動說出她的心情；對話多一點，氣氛輕鬆"
          rows={5}
          className="w-full text-xs resize-none rounded border border-ink-200 dark:border-ink-600 bg-white dark:bg-ink-800 text-ink-700 dark:text-ink-200 px-2 py-1.5 placeholder:text-ink-400 focus:outline-none focus:ring-1 focus:ring-accent/40 leading-relaxed"
        />
      </AccordionSection>

      {/* Params section — collapsible, default closed */}
      <div className="border-b border-ink-200 dark:border-ink-700">
        <button
          type="button"
          onClick={() => setParamsOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-ink-600 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-ink-700/50 transition-colors"
        >
          <span>⚙ 生成參數（Qwen3）</span>
          <span className="text-ink-400 dark:text-ink-500 text-[10px] ml-2">
            {paramsOpen ? '▲' : '▼'}
          </span>
        </button>

        {paramsOpen && (
          <div className="px-4 pb-4">
            <ParamSlider
              label="temperature — 創意程度"
              description="越高輸出越多樣、越有創意，越低越保守穩定。寫詩/創意段落建議 0.8-1.2；寫對話建議 0.6-0.8"
              value={params.temperature}
              min={0.0}
              max={2.0}
              step={0.05}
              defaultValue={DEFAULT_QWEN3_PARAMS.temperature}
              onChange={(v) => set('temperature', v)}
            />
            <ParamSlider
              label="top_p — 候選詞範圍（nucleus）"
              description="每次只從累積機率達此值的詞中選。0.9 是常用預設；降低可讓文字更聚焦"
              value={params.topP}
              min={0.0}
              max={1.0}
              step={0.05}
              defaultValue={DEFAULT_QWEN3_PARAMS.topP}
              onChange={(v) => set('topP', v)}
            />
            <ParamNumber
              label="top_k — 候選詞數量"
              description="每次只考慮機率最高的 k 個詞。數值越大選擇空間越大；設 0 代表不限制"
              value={params.topK}
              min={1}
              max={200}
              defaultValue={DEFAULT_QWEN3_PARAMS.topK}
              onChange={(v) => set('topK', v)}
            />
            <ParamSlider
              label="min_p — 最低機率門檻（Qwen3 特有）"
              description="過濾掉機率低於 top token × min_p 的選項；可替代 top_p，設 0.05-0.1 有良好效果"
              value={params.minP}
              min={0.0}
              max={1.0}
              step={0.01}
              defaultValue={DEFAULT_QWEN3_PARAMS.minP}
              onChange={(v) => set('minP', v)}
            />
            <ParamSlider
              label="repetition_penalty — 重複懲罰"
              description="大於 1.0 時懲罰已出現過的詞，避免文字打轉。1.0 = 不懲罰；1.1-1.3 是推薦範圍；過高會讓文字不自然"
              value={params.repetitionPenalty}
              min={1.0}
              max={2.0}
              step={0.05}
              defaultValue={DEFAULT_QWEN3_PARAMS.repetitionPenalty}
              onChange={(v) => set('repetitionPenalty', v)}
            />
            <ParamNumber
              label="max_tokens — 最大輸出字數"
              description="限制 AI 這次最多輸出多少 token。中文約 1 token ≈ 1.5 字；4096 token ≈ 6000 字"
              value={params.maxTokens}
              min={256}
              max={32768}
              defaultValue={DEFAULT_QWEN3_PARAMS.maxTokens}
              onChange={(v) => set('maxTokens', v)}
            />

            {/* enable_thinking toggle */}
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-0.5">
                <label className="text-xs font-medium text-ink-700 dark:text-ink-200 flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={params.enableThinking}
                    onChange={(e) => set('enableThinking', e.target.checked)}
                    className="w-3.5 h-3.5 accent-green-700 cursor-pointer"
                  />
                  enable_thinking — 思考模式（Qwen3 特有）
                </label>
                <button
                  type="button"
                  onClick={() => set('enableThinking', DEFAULT_QWEN3_PARAMS.enableThinking)}
                  className="text-[10px] text-ink-400 hover:text-ink-600 dark:hover:text-ink-200 underline leading-none ml-auto"
                >
                  重設
                </button>
              </div>
              <p className="text-[11px] text-ink-400 dark:text-ink-500 mt-0.5 leading-snug">
                開啟後 AI 會先在內部推理，再輸出正文；對複雜劇情轉折有幫助，但輸出會慢且多佔 token。開啟後多出 thinking_budget 參數
              </p>
            </div>

            {/* thinking_budget — only when enable_thinking is true */}
            {params.enableThinking && (
              <ParamNumber
                label="thinking_budget — 思考 token 預算"
                description="限制思考步驟佔用的最大 token；建議 1000-4000"
                value={params.thinkingBudget}
                min={500}
                max={16000}
                defaultValue={DEFAULT_QWEN3_PARAMS.thinkingBudget}
                onChange={(v) => set('thinkingBudget', v)}
              />
            )}

            {/* Reset all */}
            <div className="mt-2 text-right">
              <button
                type="button"
                onClick={() => onParamsChange({ ...DEFAULT_QWEN3_PARAMS })}
                className="text-[11px] text-ink-400 hover:text-ink-600 dark:hover:text-ink-200 underline"
              >
                重設全部
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Character row (accordion inside accordion) ----

function CharacterRow({ name, bodySnippet }: { name: string; bodySnippet: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-ink-100 dark:border-ink-700 rounded">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-medium text-ink-700 dark:text-ink-200 hover:bg-ink-50 dark:hover:bg-ink-700/40 transition-colors rounded"
      >
        <span>{name}</span>
        <span className="text-ink-400 text-[10px]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-2.5 pb-2 text-[11px] text-ink-500 dark:text-ink-400 whitespace-pre-wrap leading-snug border-t border-ink-100 dark:border-ink-700 pt-1.5">
          {bodySnippet || '（無摘要）'}
        </div>
      )}
    </div>
  );
}
