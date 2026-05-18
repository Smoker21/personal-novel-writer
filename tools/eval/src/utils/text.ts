/**
 * Counts Chinese characters (CJK Unified Ideographs).
 * Excludes punctuation, whitespace, ASCII letters/digits.
 */
export function countChineseChars(text: string): number {
  let n = 0;
  for (const ch of text) {
    // biome-ignore lint/style/noNonNullAssertion: iterating over string guarantees codePointAt(0) is defined
    const cp = ch.codePointAt(0)!;
    if (
      (cp >= 0x4e00 && cp <= 0x9fff) ||
      (cp >= 0x3400 && cp <= 0x4dbf) ||
      (cp >= 0x20000 && cp <= 0x2a6df)
    ) {
      n++;
    }
  }
  return n;
}

/**
 * Counts mixed words: Chinese chars + ASCII word groups (each word = 1).
 * Used when "字數" might include English words.
 */
export function countMixedWords(text: string): number {
  const chinese = countChineseChars(text);
  const englishWords = (text.match(/[A-Za-z][A-Za-z0-9'-]*/g) ?? []).length;
  return chinese + englishWords;
}

/**
 * Length of the longest common substring between a and b.
 * O(|a| * |b|) DP — fine for our use (limited prompts and outputs).
 */
export function longestCommonSubstring(a: string, b: string): number {
  if (!a || !b) return 0;
  const al = a.length;
  const bl = b.length;
  if (al * bl > 4_000_000) {
    return longestCommonSubstringSampled(a, b);
  }
  let prev = new Array<number>(bl + 1).fill(0);
  let curr = new Array<number>(bl + 1).fill(0);
  let best = 0;
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : 0;
      if (curr[j] > best) best = curr[j];
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }
  return best;
}

function longestCommonSubstringSampled(a: string, b: string): number {
  const window = 4000;
  let best = 0;
  for (let off = 0; off < a.length; off += window / 2) {
    const piece = a.slice(off, off + window);
    const local = longestCommonSubstring(piece, b);
    if (local > best) best = local;
  }
  return best;
}

export function truncate(text: string, n: number): string {
  if (text.length <= n) return text;
  return text.slice(0, n);
}

export function firstChars(text: string, n: number): string {
  return truncate(text.replace(/\r\n/g, "\n"), n);
}
