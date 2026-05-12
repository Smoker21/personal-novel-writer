import { AnthropicProvider } from "../src/providers/anthropic.js";

const apiKey = process.env["ANTHROPIC_API_KEY"];
if (!apiKey) {
  console.error("ANTHROPIC_API_KEY not set");
  process.exit(1);
}

const provider = new AnthropicProvider(apiKey);
const response = await provider.generate({
  modelId: "anthropic:claude-haiku-4-5",
  systemPrompt: "Reply with exactly one word.",
  messages: [{ role: "user", content: 'Say "Hello".' }],
  maxOutputTokens: 10,
});
console.log("Response:", response.text);
console.log("Usage:", response.usage);
console.log("Finish reason:", response.finishReason);
