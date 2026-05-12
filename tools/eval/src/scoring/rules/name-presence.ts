import { AutoScore } from "../../types.js";

const KNOWN_CHARACTERS = ["蘇晴", "林書言"];

const NAME_TYPO_PATTERNS = [
  { wrong: "蘇情", right: "蘇晴" },
  { wrong: "蘇青", right: "蘇晴" },
  { wrong: "苏晴", right: "蘇晴" },
  { wrong: "林書嚴", right: "林書言" },
  { wrong: "林書彥", right: "林書言" },
  { wrong: "林書炎", right: "林書言" },
];

const COMMON_SURNAMES = [
  "李", "王", "張", "劉", "陳", "楊", "趙", "黃", "周", "吳", "徐", "孫", "胡",
  "朱", "高", "林", "何", "郭", "馬", "羅", "梁", "宋", "鄭", "謝", "韓", "唐",
  "馮", "于", "董", "蕭", "程", "柴", "袁", "鄧", "許", "傅", "沈", "曾", "彭",
  "呂", "蘇", "盧", "蔣", "蔡", "賈", "丁", "魏", "薛", "葉", "閻", "余", "潘",
  "杜", "戴", "夏", "鍾", "汪", "田", "任", "姜", "范", "方", "石", "姚", "譚",
  "盛", "邱", "施", "牛", "洪", "龔", "邵",
];

/**
 * Generic role / status nouns that look name-like to the regex but aren't characters.
 */
const ROLE_NOUN_STOPWORDS = new Set([
  "老闆", "客人", "男人", "女人", "店員", "鄰居", "老鄰居", "母親", "父親",
  "搶匪", "編輯", "助手", "作者", "店主", "前店主", "姓謝", "言字",
  "老師", "師傅", "先生", "小姐", "太太", "同學", "同事",
]);

/**
 * Particles / verbs / adverbs that frequently follow a name-shaped 2-char chunk
 * and inflate it to a 3-char false positive ("蘇晴點" / "張地" etc.).
 * If the third char of a 3-char match is one of these, trim it.
 */
const TRAILING_PARTICLES = new Set([
  "與", "和", "跟", "及", "或", "也", "又", "都", "就", "才",
  "走", "說", "問", "看", "聽", "想", "覺", "笑", "哭", "點", "搖", "握", "推", "拉",
  "地", "的", "得", "了", "著", "過", "之", "而", "且",
  "在", "向", "對", "把", "被", "給",
]);

/**
 * Two-character common phrases that START with a Chinese surname char but are NOT names.
 * Matches against `match[0].slice(0, 2)`. Add liberally — any false alarm beats a
 * missed real character because the LLM-as-character contract is the binding rule.
 */
const NON_NAME_PREFIXES_2 = new Set([
  // 謝
  "謝謝", "謝意",
  // 任
  "任何", "任意", "任務", "任職", "任性", "任由", "任憑", "任命",
  // 何
  "何嘗", "何況", "何時", "何必", "何不", "何方", "何來", "何在", "何處", "何為", "何止", "何苦", "何要",
  // 高
  "高大", "高興", "高中", "高潮", "高約", "高挑", "高度", "高低", "高聳", "高昂", "高貴", "高峰", "高雄", "高速", "高燒", "高估",
  // 馬
  "馬上", "馬克", "馬路", "馬力", "馬達", "馬車", "馬桶", "馬虎",
  // 方
  "方便", "方法", "方式", "方面", "方向", "方才", "方圓", "方塊", "方案", "方位", "方言",
  // 程
  "程式", "程序", "程度",
  // 牛
  "牛仔", "牛奶", "牛皮", "牛排", "牛肉", "牛市", "牛角", "牛腩", "牛羊", "牛年",
  // 曾
  "曾經", "曾祖",
  // 許
  "許多", "許可", "許願", "許下", "許諾", "許吧", "許我",
  // 施
  "施工", "施加", "施肥", "施捨", "施展", "施行",
  // 陳
  "陳述", "陳列", "陳設", "陳舊", "陳腐", "陳到",
  // 王
  "王國", "王朝", "王子", "王后", "王冠", "王室",
  // 朱
  "朱紅", "朱砂",
  // 楊
  "楊柳", "楊樹",
  // 葉
  "葉子",
  // 黃
  "黃色", "黃昏", "黃金", "黃河", "黃豆", "黃道", "黃鶯", "黃鸝", "黃鳥",
  // 周
  "周圍", "周遭", "周末", "周年", "周到", "周折",
  // 戴
  "戴上", "戴著", "戴帽",
  // 田
  "田裡", "田地", "田野", "田徑",
  // 石
  "石頭", "石塊", "石器", "石灰",
  // 杜
  "杜絕", "杜撰",
  // 夏
  "夏天", "夏季", "夏日",
  // 鍾
  "鍾愛", "鍾情",
  // 范 / 范圍 (繁體 範圍, 但保險)
  "范圍",
  // 張 (量詞 / 動詞)
  "張開", "張嘴", "張貼", "張望", "張大",
  // 余
  "余年", "余暉",
]);

/**
 * Two-char compounds where the surname is the SECOND char.
 * If `text[match.index-1] + match[0][0]` is in this set, the surname is part of
 * a compound word (緊張, 工程, 措施, 對方…), not a name beginning.
 */
const COMPOUND_BEFORE_SURNAME = new Set([
  // 張
  "緊張", "主張", "誇張", "開張", "慌張", "鋪張", "聲張", "一張", "兩張", "三張", "四張", "五張",
  "幾張", "多張", "整張", "半張", "每張", "這張", "那張",
  // 方 (繁體 + 簡體 + 「角色詞 + 方」)
  "對方", "雙方", "北方", "南方", "西方", "東方", "地方", "敵方", "我方", "前方", "後方",
  "上方", "下方", "正方", "立方", "處方",
  "对方", "双方", "敌方",
  "男方", "女方", "另方", "一方", "多方", "他方", "她方", "兩方", "两方", "三方",
  "甲方", "乙方", "丙方", "買方", "买方", "賣方", "卖方", "正方", "反方",
  // 程
  "工程", "過程", "行程", "旅程", "路程", "課程", "排程", "里程", "歷程", "規程", "章程", "射程", "音程",
  // 高
  "升高", "提高", "增高", "拔高", "登高", "至高", "最高", "極高", "崇高", "身高",
  // 馬
  "立馬", "兵馬", "犬馬", "鞍馬", "賽馬", "下馬", "落馬", "上馬", "騎馬", "走馬",
  // 牛
  "公牛", "母牛", "鬥牛", "野牛", "犁牛", "黃牛", "牽牛", "蝸牛", "笨牛",
  // 何
  "為何", "如何", "奈何", "幾何", "緣何", "若何", "從何", "由何",
  // 任
  "前任", "現任", "新任", "卸任", "上任", "出任", "委任", "兼任", "擔任", "歷任", "信任", "勝任", "適任",
  // 施
  "措施", "實施", "設施", "佈施", "施展",
  // 陳
  "鋪陳",
  // 葉
  "落葉", "茶葉", "樹葉", "黃葉", "枯葉",
  // 周
  "圓周", "四周",
  // 黃
  "蛋黃", "金黃", "焦黃",
  // 林
  "森林", "竹林", "樹林", "山林", "園林",
  // 田
  "農田", "耕田", "稻田", "麥田", "鹽田",
  // 石
  "化石", "岩石", "頑石", "玉石", "鑽石", "礦石",
  // 楊
  "白楊",
  // 程
  // 戴
  "穿戴", "佩戴",
  // 余
  "其余", "盈余",
  // 朱
  "丹朱",
]);

/**
 * Three-character common phrases starting with a surname-shaped char.
 * Match against `match[0]` (when matched length is 3).
 */
const NON_NAME_PHRASES_3 = new Set([
  "任何人", "任何事", "任何時", "任何地", "任何個",
  "馬上準", "馬上要", "馬上就", "馬上去",
  "方便敘", "方便地", "方便了",
  "高中時", "高中老", "高中生", "高中部",
  "工程系", "程式碼", "程序員",
  "牛仔褲", "牛仔布",
  "謝謝你", "謝謝您", "謝謝妳", "謝謝誇",
  "張地說", "張地看",
  "施和歷",
  "陳到兩", "陳到了",
  "何嘗不", "何況又", "何況是",
]);

interface DetectOpts {
  /**
   * Minimum number of times a candidate must appear in the text to be flagged.
   * Real character names tend to repeat. Defaults to 2.
   */
  minOccurrences?: number;
}

export function detectExtraCharacterNames(text: string, opts: DetectOpts = {}): string[] {
  const minOcc = opts.minOccurrences ?? 2;
  const surnamePattern = new RegExp(`(${COMMON_SURNAMES.join("|")})[一-鿿]{1,2}`, "g");

  const candidates: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = surnamePattern.exec(text)) !== null) {
    let name = m[0];
    const idx = m.index;

    // 1. KNOWN character handling (prefix or suffix overlap)
    if (KNOWN_CHARACTERS.some((k) => name.startsWith(k))) continue;
    if (KNOWN_CHARACTERS.some((k) => name.endsWith(k))) continue;

    // 2. Compound-before check: surname is the 2nd char of a known compound (緊張/工程/措施…)
    if (idx > 0) {
      const compound = text[idx - 1] + name[0];
      if (COMPOUND_BEFORE_SURNAME.has(compound)) continue;
    }

    // 3. Match starts with a known non-name 2-char prefix (謝謝/任何/方便/高大…)
    if (NON_NAME_PREFIXES_2.has(name.slice(0, 2))) continue;

    // 4. Whole 3-char match is a known non-name phrase (任何人/牛仔褲/謝謝你…)
    if (name.length === 3 && NON_NAME_PHRASES_3.has(name)) continue;

    // 5. Trim trailing particle then re-check known + role + denylist
    if (name.length === 3 && TRAILING_PARTICLES.has(name[2])) {
      name = name.slice(0, 2);
      if (KNOWN_CHARACTERS.includes(name)) continue;
      if (NON_NAME_PREFIXES_2.has(name)) continue;
    }

    if (KNOWN_CHARACTERS.includes(name)) continue;
    if (ROLE_NOUN_STOPWORDS.has(name)) continue;
    if (KNOWN_CHARACTERS.some((k) => k.includes(name))) continue;

    candidates.push(name);
  }

  // 6. Frequency filter — real characters get mentioned ≥ minOcc times.
  const freq = new Map<string, number>();
  for (const c of candidates) freq.set(c, (freq.get(c) ?? 0) + 1);
  const flagged = new Set<string>();
  for (const [name, count] of freq) {
    if (count >= minOcc) flagged.add(name);
  }
  return [...flagged];
}

export function scoreNoNewCharacters(text: string): AutoScore {
  const extras = detectExtraCharacterNames(text);
  if (extras.length === 0) {
    return { score: 5, explanation: "5/5 — 未偵測到新角色姓名" };
  }
  if (extras.length === 1) {
    return {
      score: 3,
      explanation: `3/5 — 出現 1 個疑似新角色姓名：${extras[0]}（請人工確認是否為配角描述）`,
      evidence: extras,
    };
  }
  return {
    score: 1,
    explanation: `1/5 — 出現 ≥ 2 個疑似新角色姓名：${extras.join("、")}`,
    evidence: extras,
  };
}

export function scoreKnownNamesPreserved(text: string): AutoScore {
  const missing = KNOWN_CHARACTERS.filter((n) => !text.includes(n));
  const typos: string[] = [];
  for (const t of NAME_TYPO_PATTERNS) {
    if (text.includes(t.wrong) && !text.includes(t.right)) {
      typos.push(`${t.wrong}→應為 ${t.right}`);
    }
  }
  if (missing.length === 0 && typos.length === 0) {
    return { score: 5, explanation: "5/5 — 兩位主角姓名都正確出現" };
  }
  if (missing.length === 1 && typos.length === 0) {
    return {
      score: 3,
      explanation: `3/5 — 缺少 ${missing[0]}（可能因場景不需出場，請人工確認）`,
      evidence: missing,
    };
  }
  if (typos.length > 0) {
    return {
      score: 1,
      explanation: `1/5 — 角色名被改字：${typos.join("；")}`,
      evidence: typos,
    };
  }
  return {
    score: 1,
    explanation: `1/5 — 兩位主角姓名都未出現`,
    evidence: missing,
  };
}
