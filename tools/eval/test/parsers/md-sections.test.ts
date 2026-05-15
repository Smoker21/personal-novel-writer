import { describe, expect, it } from "vitest";
import {
  findAllSections,
  findSection,
  firstCodeBlock,
  parseSections,
} from "../../src/parsers/md-sections.js";

const SAMPLE = `# Title

## A
hi

## B

\`\`\`
block-b
\`\`\`

## A
again

### sub of second A
inner

## B

\`\`\`json
{}
\`\`\`
`;

describe("parseSections", () => {
  it("parses level + title", () => {
    const s = parseSections(SAMPLE);
    expect(s.map((x) => x.title)).toEqual(["Title", "A", "B", "A", "sub of second A", "B"]);
    expect(s.map((x) => x.level)).toEqual([1, 2, 2, 2, 3, 2]);
  });

  it("findAllSections returns multiple matches", () => {
    const s = parseSections(SAMPLE);
    const aSections = findAllSections(s, 2, /^A$/);
    expect(aSections.length).toBe(2);
  });

  it("findSection scoped to parent", () => {
    const s = parseSections(SAMPLE);
    const secondA = findAllSections(s, 2, /^A$/)[1];
    const sub = findSection(s, 3, /sub/, secondA);
    expect(sub?.title).toContain("sub");
  });

  it("ignores headings inside code fences", () => {
    const md = "## Outer\n```\n## not a heading\n```\n## Real\n";
    const s = parseSections(md);
    expect(s.map((x) => x.title)).toEqual(["Outer", "Real"]);
  });
});

describe("firstCodeBlock", () => {
  it("returns content of first fenced block", () => {
    expect(firstCodeBlock("\n\n```\nhello\nworld\n```\n")).toBe("hello\nworld");
  });
  it("ignores language tag", () => {
    expect(firstCodeBlock("```yaml\nfoo: bar\n```")).toBe("foo: bar");
  });
  it("returns null if none", () => {
    expect(firstCodeBlock("just text")).toBeNull();
  });
});
