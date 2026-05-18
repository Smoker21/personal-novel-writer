import { join } from "node:path";
import type { LLMRouter, RoutingPolicy } from "@novel-writer/llm-adapter";
import type { ImageExtractorInput } from "@novel-writer/prompt-library";
import { buildImageExtractorRequest } from "@novel-writer/prompt-library";
import type { CharacterFields, ExtractorOutput, PortraitScope } from "@novel-writer/shared-types";
import { readCharacter, updatePortraitFields } from "./character-fs.js";

interface ExtractOptions {
  projectPath: string;
  slug: string;
  scope: PortraitScope;
  chapterNumber: number | null;
  imagePath: string;
  storyGenre?: string;
  router: LLMRouter;
  policy: RoutingPolicy;
}

function parseExtractorOutput(text: string): ExtractorOutput {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\n?([\s\S]*?)\n?```$/m, "$1")
    .trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  if (
    typeof parsed["hairAndColor"] !== "string" ||
    typeof parsed["eyes"] !== "string" ||
    typeof parsed["bodyType"] !== "string" ||
    typeof parsed["otherFeatures"] !== "string" ||
    typeof parsed["clothing"] !== "string"
  ) {
    throw new Error("ExtractorOutput schema validation failed");
  }
  return parsed as unknown as ExtractorOutput;
}

/**
 * Call character-image-extractor Skill via LLMRouter, then write the
 * extracted appearance back into the character frontmatter.
 */
export async function extractPortraitAppearance(opts: ExtractOptions): Promise<{
  extracted: ExtractorOutput;
  writtenTo: "fields.appearance" | { chapterNumber: number };
}> {
  const { projectPath, slug, scope, chapterNumber, imagePath, storyGenre, router, policy } = opts;

  const char = await readCharacter(projectPath, slug);
  if (!char) throw Object.assign(new Error("Character not found"), { code: "CHARACTER_NOT_FOUND" });

  const absoluteImagePath =
    imagePath.startsWith("/") || /^[A-Za-z]:/.test(imagePath)
      ? imagePath
      : join(projectPath, imagePath);

  const context: ImageExtractorInput["context"] = {
    chapterNumber,
    ...(storyGenre !== undefined ? { storyGenre } : {}),
    characterName: char.fields.name,
  };

  const input: ImageExtractorInput = {
    image: { source: { kind: "path", path: absoluteImagePath } },
    context,
  };

  const req = buildImageExtractorRequest(input, policy.primary);
  let response = await router.generate(req, policy);

  let extracted: ExtractorOutput;
  try {
    extracted = parseExtractorOutput(response.text);
  } catch {
    // One retry with explicit format reminder
    const retryReq = buildImageExtractorRequest(input, policy.primary);
    retryReq.messages.push({ role: "assistant", content: response.text });
    retryReq.messages.push({
      role: "user",
      content: "請直接回傳 JSON，不要加 code fence 或說明文字。",
    });
    response = await router.generate(retryReq, policy);
    extracted = parseExtractorOutput(response.text);
  }

  // Write back to frontmatter
  await updatePortraitFields(projectPath, slug, (fields: CharacterFields) => {
    if (scope === "default") {
      return {
        ...fields,
        hairAndColor: extracted.hairAndColor,
        eyes: extracted.eyes,
        bodyType: extracted.bodyType,
        otherFeatures: extracted.otherFeatures,
        clothing: extracted.clothing,
      };
    }
    // biome-ignore lint/style/noNonNullAssertion: scope==="chapter" guarantees chapterNumber is not null
    const n = chapterNumber!;
    const parts = [
      `${extracted.hairAndColor}。${extracted.eyes}。${extracted.bodyType}。${extracted.otherFeatures}`,
      `服裝：${extracted.clothing}`,
    ];
    if (extracted.chapterNote) parts.push(`\n備註：${extracted.chapterNote}`);
    const appearance = parts.join("\n\n");
    return {
      ...fields,
      appearanceByChapter: { ...fields.appearanceByChapter, [n]: appearance },
    };
  });

  return {
    extracted,
    // biome-ignore lint/style/noNonNullAssertion: scope==="chapter" guarantees chapterNumber is not null
    writtenTo: scope === "default" ? "fields.appearance" : { chapterNumber: chapterNumber! },
  };
}
