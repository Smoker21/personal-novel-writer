import type { LLMRouter } from "@novel-writer/llm-adapter";
import type { RoutingPolicy } from "@novel-writer/llm-adapter";
import { buildConsolidatorRequest } from "@novel-writer/prompt-library";
import type { CharacterFields, ConsolidatorOutput } from "@novel-writer/shared-types";

interface ConsolidateOptions {
  router: LLMRouter;
  policy: RoutingPolicy;
  fields: CharacterFields;
}

/**
 * Call character-card-consolidator Skill via LLMRouter.
 * Returns the parsed output or throws on failure.
 */
export async function consolidateCharacter(opts: ConsolidateOptions): Promise<ConsolidatorOutput> {
  const { router, policy, fields } = opts;

  const req = buildConsolidatorRequest(fields, policy.primary);
  const response = await router.generate(req, policy);

  const text = response.text.trim();

  // Strip markdown code fence if model added one despite instructions
  const cleaned = text.replace(/^```(?:json)?\n?([\s\S]*?)\n?```$/m, "$1").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // One retry with explicit format reminder
    const retryReq = buildConsolidatorRequest(fields, policy.primary);
    retryReq.messages.push({
      role: "assistant",
      content: cleaned,
    });
    retryReq.messages.push({
      role: "user",
      content:
        '請只回傳 JSON，格式：{"aiSummary":"...","oneLineSummary":"..."}，不要加任何說明。',
    });
    const retry = await router.generate(retryReq, policy);
    const retryText = retry.text
      .trim()
      .replace(/^```(?:json)?\n?([\s\S]*?)\n?```$/m, "$1")
      .trim();
    parsed = JSON.parse(retryText);
  }

  const obj = parsed as Record<string, unknown>;
  // M5 容錯：允許舊 schema "body" 鍵當作 aiSummary
  const aiSummaryRaw = obj["aiSummary"] ?? obj["body"];
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof aiSummaryRaw !== "string" ||
    typeof obj["oneLineSummary"] !== "string"
  ) {
    throw new Error("Consolidator output does not match expected schema");
  }

  return {
    aiSummary: aiSummaryRaw as string,
    oneLineSummary: obj["oneLineSummary"] as string,
  };
}
