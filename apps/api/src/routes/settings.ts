import { zValidator } from "@hono/zod-validator";
import type { AppSettings, LLMProviderId, ProviderConfig } from "@novel-writer/shared-types";
import { ALL_PROVIDER_IDS, defaultSettings } from "@novel-writer/shared-types";
import { Hono } from "hono";
import { z } from "zod";
import { testProvider } from "../services/provider-tester.js";
import { maskSettings, readSettings, writeSettings } from "../services/settings-store.js";

const providerConfigSchema = z.object({
  enabled: z.boolean(),
  apiKey: z.string().optional(),
  endpoint: z.string().optional(),
  defaultModel: z.string().optional(),
});

const routingPolicySchema = z
  .object({ primary: z.string(), fallbacks: z.array(z.string()) })
  .optional();

const settingsSchema = z.object({
  schemaVersion: z.literal(1),
  providers: z.record(providerConfigSchema),
  routing: z.object({
    chapterWriter: routingPolicySchema,
    characterCardConsolidator: routingPolicySchema,
    characterImageExtractor: routingPolicySchema,
    statusUpdater: routingPolicySchema,
    statusShortener: routingPolicySchema,
  }),
  recentProjects: z.array(z.unknown()),
  meta: z.object({ firstLaunchWarningAcknowledged: z.boolean() }),
});

const testProviderSchema = z.object({
  providerId: z.enum(ALL_PROVIDER_IDS as [LLMProviderId, ...LLMProviderId[]]),
  config: providerConfigSchema.optional(),
});

export const settings = new Hono()
  .get("/", async (c) => {
    const s = await readSettings();
    return c.json(maskSettings(s));
  })
  .put("/", zValidator("json", settingsSchema), async (c) => {
    const incoming = c.req.valid("json") as AppSettings;
    const current = await readSettings();
    // If apiKey contains "***", the frontend sent back a masked value — restore the real key.
    for (const id of ALL_PROVIDER_IDS) {
      const newKey = incoming.providers[id]?.apiKey;
      if (newKey?.includes("***")) {
        const realKey = current.providers[id]?.apiKey;
        const existing = incoming.providers[id] ?? { enabled: false };
        if (realKey !== undefined) {
          incoming.providers[id] = { ...existing, apiKey: realKey };
        } else {
          const { apiKey: _drop, ...rest } = existing;
          void _drop;
          incoming.providers[id] = rest;
        }
      }
    }
    // INVALID_ROUTING: block save if routing primary provider is not enabled
    const agentRoutingKeys = [
      "chapterWriter",
      "characterCardConsolidator",
      "characterImageExtractor",
      "statusUpdater",
    ] as const;
    for (const key of agentRoutingKeys) {
      const policy = incoming.routing[key];
      if (!policy?.primary) continue;
      const colonIdx = policy.primary.indexOf(":");
      const providerId = colonIdx >= 0 ? policy.primary.slice(0, colonIdx) : policy.primary;
      const provConfig = incoming.providers[providerId as LLMProviderId];
      if (provConfig && !provConfig.enabled) {
        return c.json(
          {
            code: "INVALID_ROUTING",
            message: `Provider "${providerId}" for ${key} is not enabled. Enable it first.`,
            field: key,
          },
          400,
        );
      }
    }

    await writeSettings(incoming);
    return c.json({ ok: true });
  })
  .post("/test-provider", zValidator("json", testProviderSchema), async (c) => {
    const { providerId, config } = c.req.valid("json");
    const current = await readSettings();
    // Cast through ProviderConfig: zod schema mirrors the interface but exactOptionalPropertyTypes
    // means we must assert — the schema guarantees shape correctness at runtime.
    const effectiveConfig: ProviderConfig = (config as ProviderConfig | undefined) ??
      current.providers[providerId] ?? { enabled: false };
    const result = await testProvider(providerId, effectiveConfig);
    return c.json(result);
  })
  .post("/reset", async (c) => {
    await writeSettings(defaultSettings());
    return c.json({ ok: true });
  })
  .get("/secret/:provider", async (c) => {
    const provider = c.req.param("provider") as LLMProviderId;
    if (!ALL_PROVIDER_IDS.includes(provider)) {
      return c.json({ error: "invalid provider" }, 400);
    }
    const s = await readSettings();
    return c.json({ apiKey: s.providers[provider]?.apiKey ?? "" });
  });
