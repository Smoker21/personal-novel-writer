/**
 * Lightweight markdown section / code-block extractor.
 * We only need: find a heading by level + (regex of) text, then return
 * the first fenced code block under that heading (before the next heading
 * of the same or shallower level).
 */
export interface Section {
  level: number;
  title: string;
  start: number;
  end: number;
  body: string;
}

export function parseSections(md: string): Section[] {
  const lines = md.split(/\r?\n/);
  const sections: Section[] = [];
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) {
      sections.push({
        level: m[1].length,
        title: m[2].trim(),
        start: i,
        end: lines.length,
        body: "",
      });
    }
  }

  for (let i = 0; i < sections.length; i++) {
    const cur = sections[i];
    let end = lines.length;
    for (let j = i + 1; j < sections.length; j++) {
      if (sections[j].level <= cur.level) {
        end = sections[j].start;
        break;
      }
    }
    cur.end = end;
    cur.body = lines.slice(cur.start + 1, end).join("\n");
  }

  return sections;
}

export function findSection(
  sections: Section[],
  level: number,
  titlePattern: RegExp,
  parent?: Section,
): Section | undefined {
  for (const s of sections) {
    if (s.level !== level) continue;
    if (parent && (s.start < parent.start || s.start >= parent.end)) continue;
    if (titlePattern.test(s.title)) return s;
  }
  return undefined;
}

export function findAllSections(
  sections: Section[],
  level: number,
  titlePattern: RegExp,
  parent?: Section,
): Section[] {
  return sections.filter((s) => {
    if (s.level !== level) return false;
    if (parent && (s.start < parent.start || s.start >= parent.end)) return false;
    return titlePattern.test(s.title);
  });
}

/**
 * Returns the first fenced code block content within `text`,
 * or null if none. Strips the trailing newline.
 */
export function firstCodeBlock(text: string): string | null {
  const re = /^[ \t]*```[^\n]*\n([\s\S]*?)\n[ \t]*```/m;
  const m = re.exec(text);
  if (!m) return null;
  return m[1];
}
