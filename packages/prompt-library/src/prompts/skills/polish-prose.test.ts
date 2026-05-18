/**
 * Unit tests for polish-prose prompt template builder.
 *
 * 涵蓋：
 *   - system prompt 內容符合 skill spec §5
 *   - user message 組裝正確（含 contextBefore / contextAfter / polishInput）
 *   - polishInput 空字串 → 自由潤飾 fallback 文字
 *   - contextBefore / contextAfter 未提供時不出現在 user message
 *   - selectedText 為唯一必填欄位
 *   - 段落分隔規則說明在 system prompt 中
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildPolishProsePrompt } from "./polish-prose.js";

describe("buildPolishProsePrompt — system prompt", () => {
  it("system prompt contains key non-modification rules", () => {
    const { systemPrompt } = buildPolishProsePrompt({
      selectedText: "測試文字",
      polishInput: "",
    });
    expect(systemPrompt).toContain("不增加或刪除任何情節事件");
    expect(systemPrompt).toContain("不修改角色名稱");
    expect(systemPrompt).toContain("不修改對白的實質內容");
    expect(systemPrompt).toContain("不修改時序、視角、時態");
    expect(systemPrompt).toContain("± 30% 內");
  });

  it("system prompt instructs to preserve paragraph breaks", () => {
    const { systemPrompt } = buildPolishProsePrompt({
      selectedText: "段落一\n\n段落二",
      polishInput: "",
    });
    expect(systemPrompt).toContain("保留段落分隔");
  });

  it("system prompt forbids markdown / code fence in output", () => {
    const { systemPrompt } = buildPolishProsePrompt({
      selectedText: "text",
      polishInput: "",
    });
    expect(systemPrompt).toContain("不要 markdown");
    expect(systemPrompt).toContain("code fence");
  });

  it("produces identical system prompt across multiple calls (deterministic)", () => {
    const hash = (text: string) => createHash("sha256").update(text).digest("hex");
    const r1 = buildPolishProsePrompt({ selectedText: "a", polishInput: "" });
    const r2 = buildPolishProsePrompt({ selectedText: "a", polishInput: "" });
    expect(hash(r1.systemPrompt)).toBe(hash(r2.systemPrompt));
  });
});

describe("buildPolishProsePrompt — user message composition", () => {
  it("includes selectedText in user message under 選取段落 label", () => {
    const { userMessage } = buildPolishProsePrompt({
      selectedText: "她輕輕推開了門，門軸發出細微的嘎吱聲。",
      polishInput: "",
    });
    expect(userMessage).toContain("【選取段落（請潤稿）】");
    expect(userMessage).toContain("她輕輕推開了門，門軸發出細微的嘎吱聲。");
  });

  it("includes contextBefore when provided", () => {
    const { userMessage } = buildPolishProsePrompt({
      selectedText: "選取文字",
      contextBefore: "前文前文前文",
      polishInput: "",
    });
    expect(userMessage).toContain("【前文（不可修改）】");
    expect(userMessage).toContain("前文前文前文");
  });

  it("includes contextAfter when provided", () => {
    const { userMessage } = buildPolishProsePrompt({
      selectedText: "選取文字",
      contextAfter: "後文後文後文",
      polishInput: "",
    });
    expect(userMessage).toContain("【後文（不可修改）】");
    expect(userMessage).toContain("後文後文後文");
  });

  it("omits 前文 section when contextBefore is undefined", () => {
    const { userMessage } = buildPolishProsePrompt({
      selectedText: "選取文字",
      polishInput: "調整節奏",
    });
    expect(userMessage).not.toContain("【前文（不可修改）】");
  });

  it("omits 後文 section when contextAfter is undefined", () => {
    const { userMessage } = buildPolishProsePrompt({
      selectedText: "選取文字",
      polishInput: "調整節奏",
    });
    expect(userMessage).not.toContain("【後文（不可修改）】");
  });

  it("omits 前文 section when contextBefore is empty string", () => {
    const { userMessage } = buildPolishProsePrompt({
      selectedText: "選取文字",
      contextBefore: "",
      polishInput: "強化情感",
    });
    expect(userMessage).not.toContain("【前文（不可修改）】");
  });

  it("omits 後文 section when contextAfter is empty string", () => {
    const { userMessage } = buildPolishProsePrompt({
      selectedText: "選取文字",
      contextAfter: "   ",
      polishInput: "強化情感",
    });
    expect(userMessage).not.toContain("【後文（不可修改）】");
  });
});

describe("buildPolishProsePrompt — polishInput edge cases", () => {
  it("uses 自由潤飾 fallback when polishInput is empty string", () => {
    const { userMessage } = buildPolishProsePrompt({
      selectedText: "選取文字",
      polishInput: "",
    });
    expect(userMessage).toContain("【使用者指令】");
    expect(userMessage).toContain("（無特別指令，請做保守潤飾）");
  });

  it("uses 自由潤飾 fallback when polishInput is whitespace only", () => {
    const { userMessage } = buildPolishProsePrompt({
      selectedText: "選取文字",
      polishInput: "   ",
    });
    expect(userMessage).toContain("（無特別指令，請做保守潤飾）");
  });

  it("includes user instruction when polishInput is non-empty", () => {
    const { userMessage } = buildPolishProsePrompt({
      selectedText: "選取文字",
      polishInput: "調整對白節奏，讓對話更自然",
    });
    expect(userMessage).toContain("調整對白節奏，讓對話更自然");
    expect(userMessage).not.toContain("（無特別指令");
  });

  it("trims leading/trailing whitespace from polishInput", () => {
    const { userMessage } = buildPolishProsePrompt({
      selectedText: "文字",
      polishInput: "  強化情感  ",
    });
    expect(userMessage).toContain("強化情感");
    expect(userMessage).not.toContain("  強化情感  ");
  });
});

describe("buildPolishProsePrompt — full composition with all fields", () => {
  it("returns correct sections in order: 前文 → 選取段落 → 後文 → 使用者指令", () => {
    const { userMessage } = buildPolishProsePrompt({
      selectedText: "蘇晴站在書店門口，等待雨停。",
      contextBefore: "那天傍晚的天空突然陰沉了下來。",
      contextAfter: "雨越下越大，她決定往裡走幾步。",
      polishInput: "強化氛圍感",
    });

    const beforeIdx = userMessage.indexOf("【前文（不可修改）】");
    const selectedIdx = userMessage.indexOf("【選取段落（請潤稿）】");
    const afterIdx = userMessage.indexOf("【後文（不可修改）】");
    const instructIdx = userMessage.indexOf("【使用者指令】");

    expect(beforeIdx).toBeGreaterThan(-1);
    expect(selectedIdx).toBeGreaterThan(beforeIdx);
    expect(afterIdx).toBeGreaterThan(selectedIdx);
    expect(instructIdx).toBeGreaterThan(afterIdx);
  });

  it("contains all provided text verbatim", () => {
    const input = {
      selectedText: "她輕輕推開了門。",
      contextBefore: "前文段落",
      contextAfter: "後文段落",
      polishInput: "加強動作細節",
    };
    const { userMessage } = buildPolishProsePrompt(input);
    expect(userMessage).toContain(input.selectedText);
    expect(userMessage).toContain(input.contextBefore);
    expect(userMessage).toContain(input.contextAfter);
    expect(userMessage).toContain(input.polishInput);
  });

  it("golden hash: identical output for same input across runs", () => {
    const hash = (s: string) => createHash("sha256").update(s).digest("hex");
    const input = {
      selectedText: "她輕輕推開了門，門軸發出細微的嘎吱聲。",
      contextBefore: "那天傍晚的天空突然陰沉了下來。",
      contextAfter: "雨越下越大，她決定往裡走幾步。",
      polishInput: "強化氛圍感",
    };
    const r1 = buildPolishProsePrompt(input);
    const r2 = buildPolishProsePrompt(input);
    expect(hash(r1.systemPrompt + r1.userMessage)).toBe(hash(r2.systemPrompt + r2.userMessage));
  });
});
