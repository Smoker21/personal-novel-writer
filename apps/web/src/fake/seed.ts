// Idempotent seed runner. Marks itself done in `meta` store; safe across F5.

import { getMeta, setMeta } from '@/storage/idb';
import {
  putProject,
  putCharacter,
  putChapter,
  putStatus,
  putCommit,
  putSettings,
  countChars,
} from '@/storage/projectStore';
import {
  FAKE_AI_CHARACTER_BODY,
  FAKE_CHAPTER_1_CONTENT,
  FAKE_CHAPTER_2_CONTENT,
  FAKE_STORY_STATUS,
} from './sampleProse';
import type { Settings } from '@/types';

const SEED_FLAG = 'seeded:v2';

export async function ensureSeed(): Promise<void> {
  const done = await getMeta<boolean>(SEED_FLAG);
  if (done) return;

  const now = Date.now();
  const SLUG = 'spring-diary';

  // 1. Project: 春日記事
  await putProject({
    slug: SLUG,
    name: '春日記事',
    path: 'F:/novels/春日記事',
    synopsis: '一個編輯與書店主人的相遇與漸近——蘇晴從台北搬回外婆生前住過的小鎮，意外走進巷尾的「青鳥書店」，遇見了沉默寡言的書店主人林書言。',
    createdAt: now - 1000 * 60 * 60 * 24 * 14,
    lastOpenedAt: now - 1000 * 60 * 60 * 2,
  });

  // Two more example "recent projects" for the home screen
  await putProject({
    slug: 'dark-river',
    name: '暗河',
    path: 'F:/novels/暗河',
    synopsis: '一場關於記憶與謊言的長篇懸疑',
    createdAt: now - 1000 * 60 * 60 * 24 * 60,
    lastOpenedAt: now - 1000 * 60 * 60 * 24,
  });
  await putProject({
    slug: 'corner-cafe',
    name: '街角咖啡店',
    path: 'F:/novels/咖啡店',
    synopsis: '（試寫）',
    createdAt: now - 1000 * 60 * 60 * 24 * 30,
    lastOpenedAt: now - 1000 * 60 * 60 * 24 * 8,
  });

  // 2. Three characters in spring-diary
  await putCharacter({
    id: 'char-suqing',
    projectSlug: SLUG,
    name: '蘇晴',
    age: 30,
    gender: 'female',
    pronoun: '她',
    role: '主角',
    personalityTags: ['內向', '含蓄', '敏感'],
    mbti: 'INFJ',
    zodiac: '處女座',
    bloodType: 'A',
    culturalBackground: '台灣，於小鎮由祖母帶大，成年後北上工作。',
    heightCm: 165,
    bodyType: '中等偏瘦',
    hairAndColor: '黑色長髮綁低馬尾',
    eyes: '深褐色，眼神專注',
    otherFeatures: '左手腕內側有一道淡淡的舊疤',
    dialoguePace: 'slow',
    wordingPreference: '偏文藝、不口語、常用「其實」「大概」這類緩和詞',
    writingAvoid: '不要寫成憂鬱症患者；她安靜但不消極',
    relations: '與 [[林書言]] 從陌生到漸近；與 [[蘇祖母]] 是孫女與祖母（祖母已過世）',
    intimateNotes: '',
    body: FAKE_AI_CHARACTER_BODY,
    bodyLastModel: 'anthropic:claude-haiku-4-5',
    bodyLastGeneratedAt: now - 1000 * 60 * 5,
    bodyLastGeneratedHash: hashString(FAKE_AI_CHARACTER_BODY),
    manuallyEdited: false,
    createdAt: now - 1000 * 60 * 60 * 24 * 10,
    updatedAt: now - 1000 * 60 * 5,
  });

  await putCharacter({
    id: 'char-linshuyan',
    projectSlug: SLUG,
    name: '林書言',
    age: 34,
    gender: 'male',
    pronoun: '他',
    role: '主要配角',
    personalityTags: ['沉穩', '寡言', '溫柔'],
    mbti: 'ISTP',
    zodiac: '天秤座',
    bloodType: 'O',
    culturalBackground: '在地小鎮人，從父親手上繼承書店',
    heightCm: 178,
    bodyType: '清瘦',
    hairAndColor: '黑色短髮，微捲',
    eyes: '黑色，眼神內斂',
    otherFeatures: '常穿深灰色或墨綠色毛衣',
    dialoguePace: 'slow',
    wordingPreference: '簡短、極少用形容詞',
    writingAvoid: '不要寫成「冷酷」或「神秘」型；他只是安靜，不冷',
    relations: '與 [[蘇晴]] 從店主與客人的距離逐漸接近',
    intimateNotes: '',
    body: '林書言是青鳥書店的第二代主人，34 歲，繼承父親留下的書店已經第七年。\n\n他話不多，但對店裡的每一本書都認得。客人來借讀他不說話，買書他也不推薦——他相信書會自己選人。\n\n他穿衣以深色為主，常見墨綠色或深灰色毛衣，從來不穿亮色。他不擅長表達情感，卻會用一杯熱茶、一個眼神、一句最短的提醒，把溫度傳出去。',
    bodyLastModel: 'anthropic:claude-haiku-4-5',
    bodyLastGeneratedAt: now - 1000 * 60 * 60 * 4,
    bodyLastGeneratedHash: hashString('林書言是青鳥書店的第二代主人'),
    manuallyEdited: false,
    createdAt: now - 1000 * 60 * 60 * 24 * 9,
    updatedAt: now - 1000 * 60 * 60 * 4,
  });

  await putCharacter({
    id: 'char-grandma',
    projectSlug: SLUG,
    name: '蘇祖母',
    age: 78,
    gender: 'female',
    pronoun: '她',
    role: '回憶角色',
    personalityTags: ['慈祥', '寡言', '堅韌'],
    culturalBackground: '客家移民第二代，戰後遷居此鎮',
    heightCm: 152,
    bodyType: '矮小清瘦',
    hairAndColor: '銀白短髮',
    eyes: '深褐色，眼角紋路深',
    otherFeatures: '常穿藏青色棉布上衣',
    dialoguePace: 'slow',
    wordingPreference: '偶爾混雜客家話',
    writingAvoid: '不要寫成「悲苦」型老太太',
    relations: '與 [[蘇晴]] 是祖孫；對林書言一家有舊識（伏筆）',
    intimateNotes: '',
    body: '蘇祖母是蘇晴從小由她帶大的祖母。她在小鎮上開過裁縫店，後來歲數大了關掉，但仍習慣每天清晨繞到公園散步。\n\n她話不多，給孩子的方式是把熱湯放在桌上，不會問妳今天過得怎樣。\n\n她在去年冬天於睡眠中安詳過世，留給蘇晴的除了這間公寓，還有幾箱未拆封的舊信件。',
    bodyLastModel: 'anthropic:claude-haiku-4-5',
    bodyLastGeneratedAt: now - 1000 * 60 * 60 * 24 * 2,
    bodyLastGeneratedHash: hashString('蘇祖母是蘇晴從小由她帶大的祖母'),
    manuallyEdited: false,
    createdAt: now - 1000 * 60 * 60 * 24 * 8,
    updatedAt: now - 1000 * 60 * 60 * 24 * 2,
  });

  // 3. Two saved chapters + one draft
  await putChapter({
    id: 'ch-1',
    projectSlug: SLUG,
    number: 1,
    title: '梅雨初晴',
    content: FAKE_CHAPTER_1_CONTENT,
    status: 'adopted',
    wordCount: countChars(FAKE_CHAPTER_1_CONTENT),
    updatedAt: now - 1000 * 60 * 60 * 3,
    savedAt: now - 1000 * 60 * 60 * 3,
  });

  await putChapter({
    id: 'ch-2',
    projectSlug: SLUG,
    number: 2,
    title: '書店的訪客',
    content: FAKE_CHAPTER_2_CONTENT,
    status: 'saved',
    wordCount: countChars(FAKE_CHAPTER_2_CONTENT),
    updatedAt: now - 1000 * 60 * 60 * 24,
    savedAt: now - 1000 * 60 * 60 * 24,
  });

  await putChapter({
    id: 'ch-3',
    projectSlug: SLUG,
    number: 3,
    title: '',
    content: '',
    status: 'draft',
    wordCount: 0,
    updatedAt: now,
    savedAt: undefined,
  });

  // 4. Story status
  await putStatus({
    id: `${SLUG}:story`,
    projectSlug: SLUG,
    kind: 'story',
    content: FAKE_STORY_STATUS,
    updatedAt: now - 1000 * 60 * 60 * 3,
  });

  // 5. Character status docs (simple)
  await putStatus({
    id: `${SLUG}:char:char-suqing`,
    projectSlug: SLUG,
    kind: 'character',
    charId: 'char-suqing',
    content: `# 蘇晴 — 角色狀態

## 當下處境
搬回小鎮第三天，正在重新習慣節奏。寫作上開始嘗試新的長篇。

## 重要狀態變化
- 第 1 章：第一次走進青鳥書店，遇見林書言
- 第 2 章：開始把書店當作日常會去的地方

## 與其他角色的關係
- 林書言：禮貌的距離，但已經開始注意對方
- 蘇祖母：物理上不在，但在公寓裡無處不感受到

## 🔖 個人伏筆
- 祖母留下的舊信件，蘇晴尚未拆開

## ✨ 個人轉折點
- 第 1 章末：決定每天下午都來書店寫作
`,
    updatedAt: now - 1000 * 60 * 60 * 3,
  });

  await putStatus({
    id: `${SLUG}:char:char-linshuyan`,
    projectSlug: SLUG,
    kind: 'character',
    charId: 'char-linshuyan',
    content: `# 林書言 — 角色狀態

## 當下處境
書店日常，未有大變化。

## 重要狀態變化
- 第 2 章：主動為蘇晴端了一杯茶，這是他罕見的主動接觸

## 🔖 個人伏筆
- 對蘇祖母一家的舊識，尚未對蘇晴提起
- 書店地下室傳出的舊唱片聲，刻意迴避不談

## ✨ 個人轉折點
- 第 2 章末：第一次主動接近一位客人
`,
    updatedAt: now - 1000 * 60 * 60 * 24,
  });

  // 6. Fake commits for chapter 1
  const ch1Commits: Array<{ msg: string; ago: number; delta: number }> = [
    { msg: 'chapter(1): 採用 AI 草稿', ago: 1000 * 60 * 60 * 3, delta: 4231 },
    { msg: 'chapter(1): 手動修訂結尾段', ago: 1000 * 60 * 60 * 4, delta: 68 },
    { msg: 'chapter(1): 手動修訂第二段', ago: 1000 * 60 * 60 * 5, delta: -120 },
    { msg: 'chapter(1): 儲存', ago: 1000 * 60 * 60 * 7, delta: 250 },
    { msg: 'chapter(1): 採用 AI 草稿', ago: 1000 * 60 * 60 * 8, delta: 4351 },
    { msg: 'chapter(1): 初始空白章節', ago: 1000 * 60 * 60 * 24, delta: 0 },
  ];
  for (let i = 0; i < ch1Commits.length; i++) {
    const c = ch1Commits[i]!;
    await putCommit({
      id: `commit-ch1-${i}`,
      projectSlug: SLUG,
      fileKey: 'chapter:ch-1',
      message: c.msg,
      authorTime: now - c.ago,
      wordDelta: c.delta,
      snapshotContent: i === 0 ? FAKE_CHAPTER_1_CONTENT : FAKE_CHAPTER_1_CONTENT.slice(0, Math.max(0, FAKE_CHAPTER_1_CONTENT.length - i * 200)),
      isCurrent: i === 0,
    });
  }

  // commits for chapter 2
  const ch2Commits = [
    { msg: 'chapter(2): 儲存', ago: 1000 * 60 * 60 * 24, delta: 5012 },
    { msg: 'chapter(2): 手動修訂對話', ago: 1000 * 60 * 60 * 25, delta: 32 },
    { msg: 'chapter(2): 採用 AI 草稿', ago: 1000 * 60 * 60 * 26, delta: 4980 },
    { msg: 'chapter(2): 採用 AI 草稿（首次）', ago: 1000 * 60 * 60 * 30, delta: 4520 },
    { msg: 'chapter(2): 儲存大綱', ago: 1000 * 60 * 60 * 36, delta: 380 },
    { msg: 'chapter(2): 初始空白章節', ago: 1000 * 60 * 60 * 48, delta: 0 },
  ];
  for (let i = 0; i < ch2Commits.length; i++) {
    const c = ch2Commits[i]!;
    await putCommit({
      id: `commit-ch2-${i}`,
      projectSlug: SLUG,
      fileKey: 'chapter:ch-2',
      message: c.msg,
      authorTime: now - c.ago,
      wordDelta: c.delta,
      snapshotContent: i === 0 ? FAKE_CHAPTER_2_CONTENT : FAKE_CHAPTER_2_CONTENT.slice(0, Math.max(0, FAKE_CHAPTER_2_CONTENT.length - i * 300)),
      isCurrent: i === 0,
    });
  }

  // commits for story_status
  const ssCommits = [
    { msg: 'status(story): 第 2 章採用後自動更新', ago: 1000 * 60 * 60 * 24, delta: 280 },
    { msg: 'status(story): 手動加入伏筆「祖母的舊信件」', ago: 1000 * 60 * 60 * 26, delta: 90 },
    { msg: 'status(story): AI 精簡', ago: 1000 * 60 * 60 * 30, delta: -160 },
    { msg: 'status(story): 第 1 章採用後自動更新', ago: 1000 * 60 * 60 * 8 * 24, delta: 420 },
    { msg: 'status(story): 初始化', ago: 1000 * 60 * 60 * 24 * 14, delta: 50 },
  ];
  for (let i = 0; i < ssCommits.length; i++) {
    const c = ssCommits[i]!;
    await putCommit({
      id: `commit-storystatus-${i}`,
      projectSlug: SLUG,
      fileKey: 'status:story',
      message: c.msg,
      authorTime: now - c.ago,
      wordDelta: c.delta,
      snapshotContent: i === 0 ? FAKE_STORY_STATUS : FAKE_STORY_STATUS.slice(0, Math.max(0, FAKE_STORY_STATUS.length - i * 150)),
      isCurrent: i === 0,
    });
  }

  // 7. Settings — all providers disabled by default (per brief §6.8)
  const defaultSettings: Settings = {
    id: 'singleton',
    providers: [
      { id: 'anthropic', label: 'Anthropic (Claude)', enabled: false, models: ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-7'] },
      { id: 'openai', label: 'OpenAI', enabled: false, models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1'] },
      { id: 'gemini', label: 'Google Gemini', enabled: false, models: ['gemini-2.5-flash', 'gemini-2.5-pro'] },
      { id: 'lmstudio', label: 'LM Studio (local)', enabled: false, endpoint: 'http://localhost:1234/v1', models: ['local-model'] },
      { id: 'ollama', label: 'Ollama (local)', enabled: false, endpoint: 'http://localhost:11434', models: ['llama3.1', 'qwen2.5'] },
      { id: 'rwkv-runner', label: 'RWKV Runner (local)', enabled: false, endpoint: 'http://localhost:8000', models: ['rwkv-7-world'] },
    ],
    agents: [
      { agent: 'chapter-writer', primary: undefined, fallbacks: [] },
      { agent: 'status-updater', primary: undefined, fallbacks: [] },
      { agent: 'character-card-consolidator', primary: undefined, fallbacks: [] },
      { agent: 'status-shortener', primary: undefined, fallbacks: [] },
    ],
    preferences: {
      darkMode: false,
      editorWidth: 'normal',
      autosaveDebounceMs: 1500,
      skipAdoptionConfirm: false,
    },
  };
  await putSettings(defaultSettings);

  await setMeta(SEED_FLAG, true);
}

function hashString(s: string): string {
  // Simple djb2 — used to detect manual edits, NOT cryptographic
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

export { hashString };
