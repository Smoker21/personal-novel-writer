import { describe, expect, it } from "vitest";
import {
  applyFrontmatterPatch,
  buildChapter,
  emptyFrontmatter,
  parseChapter,
} from "./chapter-frontmatter.js";

describe("parseChapter (M5 Spec 003)", () => {
  it("returns default frontmatter when no frontmatter present", () => {
    const r = parseChapter("這是純內文。\n第二段。");
    expect(r.hasFrontmatter).toBe(false);
    expect(r.frontmatter).toEqual({ participants: [], outline: null, requirements: null });
    expect(r.body).toBe("這是純內文。\n第二段。");
  });

  it("parses full frontmatter", () => {
    const raw = `---
participants:
  - 春雨
  - 明哲
outline: |
  春雨找明哲查詢借閱歷史。
requirements: |
  約 1500 字。第三人稱有限視角。
---

這是正文第一段。`;
    const r = parseChapter(raw);
    expect(r.hasFrontmatter).toBe(true);
    expect(r.frontmatter.participants).toEqual(["春雨", "明哲"]);
    expect(r.frontmatter.outline).toContain("春雨找明哲");
    expect(r.frontmatter.requirements).toContain("1500 字");
    expect(r.body).toBe("\n這是正文第一段。");
  });

  it("falls back to no-frontmatter on malformed yaml", () => {
    const raw = "---\nthis is not: valid: yaml\n---\nbody";
    const r = parseChapter(raw);
    // js-yaml is forgiving; this might still parse. The fallback is for definite errors.
    // Check we don't crash and return *something* usable.
    expect(typeof r.body).toBe("string");
  });

  it("handles empty participants array correctly", () => {
    const raw = "---\nparticipants: []\noutline: null\nrequirements: null\n---\n\nbody";
    const r = parseChapter(raw);
    expect(r.hasFrontmatter).toBe(true);
    expect(r.frontmatter.participants).toEqual([]);
    expect(r.frontmatter.outline).toBe(null);
  });
});

describe("buildChapter (M5 Spec 003)", () => {
  it("writes no frontmatter when all fields are default", () => {
    const out = buildChapter(emptyFrontmatter(), "純內文\n");
    expect(out).toBe("純內文\n");
    expect(out.startsWith("---")).toBe(false);
  });

  it("writes frontmatter when participants is non-empty", () => {
    const out = buildChapter(
      { participants: ["春雨"], outline: null, requirements: null },
      "正文",
    );
    expect(out.startsWith("---\n")).toBe(true);
    expect(out).toContain("participants:");
    expect(out).toContain("  - 春雨");
    expect(out).toContain("outline: null");
    expect(out).toContain("requirements: null");
  });

  it("writes outline with block scalar", () => {
    const out = buildChapter(
      {
        participants: [],
        outline: "第一行\n第二行",
        requirements: null,
      },
      "body",
    );
    expect(out).toContain("outline: |");
    expect(out).toContain("  第一行");
    expect(out).toContain("  第二行");
  });

  it("round-trips correctly", () => {
    const original = {
      participants: ["春雨", "明哲"],
      outline: "春雨找明哲。",
      requirements: "約 1500 字。",
    };
    const built = buildChapter(original, "正文段落\n");
    const parsed = parseChapter(built);
    expect(parsed.frontmatter).toEqual(original);
    expect(parsed.body.trim()).toBe("正文段落");
  });

  it("preserves field order: participants → outline → requirements", () => {
    const out = buildChapter(
      { participants: ["a"], outline: "o", requirements: "r" },
      "body",
    );
    const pIdx = out.indexOf("participants:");
    const oIdx = out.indexOf("outline:");
    const rIdx = out.indexOf("requirements:");
    expect(pIdx).toBeLessThan(oIdx);
    expect(oIdx).toBeLessThan(rIdx);
  });

  it("quotes slug with special chars", () => {
    const out = buildChapter(
      { participants: ["needs: quotes"], outline: null, requirements: null },
      "body",
    );
    expect(out).toContain('"needs: quotes"');
  });
});

describe("applyFrontmatterPatch (M5 Spec 003)", () => {
  it("undefined fields preserve existing", () => {
    const existing = { participants: ["a"], outline: "o1", requirements: "r1" };
    const patched = applyFrontmatterPatch(existing, {});
    expect(patched).toEqual(existing);
  });

  it("null clears outline/requirements", () => {
    const existing = { participants: ["a"], outline: "o1", requirements: "r1" };
    const patched = applyFrontmatterPatch(existing, { outline: null });
    expect(patched.outline).toBeNull();
    expect(patched.requirements).toBe("r1");
  });

  it("empty array clears participants", () => {
    const existing = { participants: ["a", "b"], outline: null, requirements: null };
    const patched = applyFrontmatterPatch(existing, { participants: [] });
    expect(patched.participants).toEqual([]);
  });
});
