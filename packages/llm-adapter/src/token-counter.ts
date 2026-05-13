import type { Message } from "./types.js";

let encoder: { encode: (text: string) => number[] } | null = null;

async function getEncoder() {
  if (encoder !== null) return encoder;
  try {
    // gpt-tokenizer uses cl100k_base, roughly compatible with most modern LLMs
    const mod = await import("gpt-tokenizer");
    encoder = { encode: (text: string) => mod.encode(text) as number[] };
    return encoder;
  } catch {
    return null;
  }
}

/**
 * Estimate token count for a string.
 * Uses gpt-tokenizer when available; falls back to char/4 approximation.
 */
export async function countTokens(text: string): Promise<number> {
  const enc = await getEncoder();
  if (enc !== null) {
    return enc.encode(text).length;
  }
  // Fallback: ~4 chars per token (conservative for CJK text)
  return Math.ceil(text.length / 2);
}

/**
 * Estimate total token count for a list of messages + system prompt.
 * Images are estimated at a fixed 765 tokens each (Anthropic's published value).
 */
export async function countMessageTokens(
  systemPrompt: string,
  messages: Message[],
): Promise<number> {
  let total = await countTokens(systemPrompt);
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      total += await countTokens(msg.content);
    } else {
      for (const part of msg.content) {
        if (part.type === "text") {
          total += await countTokens(part.text);
        } else {
          // Image token estimate: 765 tokens (Anthropic reference value)
          total += 765;
        }
      }
    }
    // Per-message overhead: ~4 tokens
    total += 4;
  }
  return total;
}
