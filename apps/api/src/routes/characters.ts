import { zValidator } from "@hono/zod-validator";
import type { CharacterFields, ConsolidatorOutput } from "@novel-writer/shared-types";
import { Hono } from "hono";
import { z } from "zod";
import { consolidateCharacter } from "../services/character-consolidate.js";
import {
  createCharacter,
  deleteCharacter,
  listCharacters,
  readCharacter,
  renameCharacter,
  updateCharacter,
} from "../services/character-fs.js";
import { resolveUniqueSlug } from "../services/character-slug.js";
import { commitIfChanged } from "../services/commit-policy.js";
import { resolveProjectPath } from "../services/project-resolver.js";
import { buildRouter, toRouterPolicy } from "../services/router-factory.js";
import { readSettings } from "../services/settings-store.js";

const app = new Hono();

// ---------------------------------------------------------------------------
// Zod schemas (M5)
// ---------------------------------------------------------------------------

const personalityTagsSchema = z.array(z.string());

const portraitSchema = z.object({
  default: z.string().nullable().optional(),
  byChapter: z.record(z.string()).optional(),
});

const sexualScenePerformanceSchema = z
  .object({
    bodyMeasurements: z.string().nullable().optional(),
    preferences: z.string().nullable().optional(),
  })
  .nullable()
  .optional();

const manuallyEditedSectionsSchema = z
  .object({
    manualDescription: z.boolean(),
    aiSummary: z.boolean(),
  })
  .optional();

const fieldsSchema = z.object({
  name: z.string().min(1),
  age: z.number().nullable().optional(),
  gender: z.string().nullable().optional(),
  pronoun: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  personalityTags: personalityTagsSchema.optional(),
  mbti: z.string().nullable().optional(),
  zodiac: z.string().nullable().optional(),
  bloodType: z.string().nullable().optional(),
  culturalBackground: z.string().nullable().optional(),
  heightCm: z.number().nullable().optional(),
  bodyType: z.string().nullable().optional(),
  hairAndColor: z.string().nullable().optional(),
  eyes: z.string().nullable().optional(),
  otherFeatures: z.string().nullable().optional(),
  clothing: z.string().nullable().optional(),
  portrait: portraitSchema.optional(),
  appearanceByChapter: z.record(z.string()).optional(),
  dialoguePace: z.enum(["快", "穩", "慢"]).nullable().optional(),
  wordingPreference: z.string().nullable().optional(),
  writingAvoid: z.string().nullable().optional(),
  relations: z.string().nullable().optional(),
  sexualScenePerformance: sexualScenePerformanceSchema,
  consolidatedAt: z.string().nullable().optional(),
  consolidatedBy: z.string().nullable().optional(),
  manuallyEditedSections: manuallyEditedSectionsSchema,
});

const createSchema = z.object({
  name: z.string().min(1),
  fields: fieldsSchema,
  /** M5: 新角色建立時的「## 角色描述（手動）」段內容 */
  manualDescription: z.string().optional(),
  /** M5: 新角色建立時的「## AI 統整敘述」段內容 */
  aiSummary: z.string().optional(),
  consolidate: z.boolean().optional(),
});

const updateSchema = z.object({
  fields: fieldsSchema.partial().optional(),
  /** M5: 「## 角色描述（手動）」段 */
  manualDescription: z.string().optional(),
  /** M5: 「## AI 統整敘述」段 */
  aiSummary: z.string().optional(),
  consolidate: z.boolean().optional(),
  rename: z.string().optional(),
});

const consolidateSchema = z.object({
  modelOverride: z.string().optional(),
});

async function getProjectPath(c: { req: { param: (k: string) => string | undefined } }): Promise<
  string | null
> {
  const hash = c.req.param("hash") ?? "";
  return resolveProjectPath(hash);
}

function responseFor(char: {
  slug: string;
  fields: CharacterFields;
  body: string;
  manualDescription: string;
  aiSummary: string;
}, _slugForPath?: string) {
  const slugForPath = _slugForPath ?? char.slug;
  return {
    slug: char.slug,
    path: `characters/${slugForPath}.md`,
    fields: char.fields,
    body: char.body,
    manualDescription: char.manualDescription,
    aiSummary: char.aiSummary,
    consolidatedAt: char.fields.consolidatedAt,
    consolidatedBy: char.fields.consolidatedBy,
  };
}

// GET /api/projects/:projectHash/characters
app.get("/", async (c) => {
  const projectPath = await getProjectPath(c);
  if (!projectPath) {
    return c.json({ code: "PROJECT_NOT_FOUND", message: "Project not found" }, 404);
  }
  const characters = await listCharacters(projectPath);
  return c.json({ characters });
});

// GET /api/projects/:projectHash/characters/:slug
app.get("/:slug", async (c) => {
  const projectPath = await getProjectPath(c);
  if (!projectPath) {
    return c.json({ code: "PROJECT_NOT_FOUND", message: "Project not found" }, 404);
  }
  const char = await readCharacter(projectPath, c.req.param("slug"));
  if (!char) {
    return c.json({ code: "CHARACTER_NOT_FOUND", message: "Character not found" }, 404);
  }
  return c.json(responseFor(char));
});

// POST /api/projects/:projectHash/characters
app.post("/", zValidator("json", createSchema), async (c) => {
  const projectPath = await getProjectPath(c);
  if (!projectPath) {
    return c.json({ code: "PROJECT_NOT_FOUND", message: "Project not found" }, 404);
  }
  const body = c.req.valid("json");

  const fields = {
    ...buildEmptyFields(body.name),
    ...body.fields,
    name: body.name,
    personalityTags: body.fields.personalityTags ?? [],
    portrait: { default: null, byChapter: {}, ...(body.fields.portrait ?? {}) },
    appearanceByChapter: body.fields.appearanceByChapter ?? {},
    consolidatedAt: null,
    consolidatedBy: null,
    manuallyEditedSections: { manualDescription: false, aiSummary: false },
  } as CharacterFields;

  let manualDescription = body.manualDescription ?? "";
  let aiSummary = body.aiSummary ?? "";
  let oneLineSummary = fields.name;

  if (body.consolidate) {
    try {
      const settings = await readSettings();
      const routingConf = settings.routing.characterCardConsolidator;
      if (!routingConf) {
        return c.json(
          {
            code: "ROUTING_NOT_CONFIGURED",
            message: "character-card-consolidator routing not configured",
          },
          400,
        );
      }
      const router = buildRouter(settings);
      const result = await consolidateCharacter({
        router,
        policy: toRouterPolicy(routingConf),
        fields,
      });
      // M5: consolidate 結果只進 aiSummary，不動 manualDescription
      aiSummary = result.aiSummary;
      oneLineSummary = result.oneLineSummary;
      fields.consolidatedAt = new Date().toISOString();
      fields.consolidatedBy = routingConf.primary;
    } catch (_err) {
      // M5: consolidate 失敗仍建立角色（fallback 空 aiSummary，使用者後續可手動觸發）
      aiSummary = "";
    }
  }

  let slug: string;
  try {
    slug = await resolveUniqueSlug(body.name, projectPath);
  } catch {
    return c.json(
      { code: "INVALID_INPUT", message: "Character name produces an invalid slug" },
      400,
    );
  }

  const char = await createCharacter(projectPath, {
    slug,
    fields,
    manualDescription,
    aiSummary,
    oneLineSummary,
  });
  await commitIfChanged(projectPath, "character", `create ${slug}`);

  return c.json(responseFor(char, slug), 201);
});

// PUT /api/projects/:projectHash/characters/:slug
app.put("/:slug", zValidator("json", updateSchema), async (c) => {
  const projectPath = await getProjectPath(c);
  if (!projectPath) {
    return c.json({ code: "PROJECT_NOT_FOUND", message: "Project not found" }, 404);
  }
  const slug = c.req.param("slug");
  const body = c.req.valid("json");

  // Handle rename
  if (body.rename) {
    const newName = body.rename.trim();
    let newSlug: string;
    try {
      newSlug = await resolveUniqueSlug(newName, projectPath, slug);
    } catch {
      return c.json({ code: "INVALID_INPUT", message: "New name produces an invalid slug" }, 400);
    }

    if (newSlug !== slug) {
      const existing = await readCharacter(projectPath, newSlug);
      if (existing) {
        return c.json(
          {
            code: "SLUG_CONFLICT",
            message: `Slug "${newSlug}" already exists`,
            suggestedSlug: `${newSlug}-2`,
          },
          409,
        );
      }
    }

    const renamed = await renameCharacter(projectPath, slug, newSlug, newName);
    if (!renamed) {
      return c.json({ code: "CHARACTER_NOT_FOUND", message: "Character not found" }, 404);
    }
    await commitIfChanged(projectPath, "character", `rename ${slug} to ${newSlug}`);
    return c.json(responseFor(renamed, renamed.slug));
  }

  const existing = await readCharacter(projectPath, slug);
  if (!existing) {
    return c.json({ code: "CHARACTER_NOT_FOUND", message: "Character not found" }, 404);
  }

  let updatedFields: CharacterFields = body.fields
    ? ({ ...existing.fields, ...body.fields } as CharacterFields)
    : existing.fields;

  // M5: per-section dirty flags
  const editedManual = body.manualDescription !== undefined;
  const editedAi = body.aiSummary !== undefined;
  if (editedManual || editedAi) {
    updatedFields = {
      ...updatedFields,
      manuallyEditedSections: {
        manualDescription: editedManual || updatedFields.manuallyEditedSections.manualDescription,
        aiSummary: editedAi || updatedFields.manuallyEditedSections.aiSummary,
      },
    };
  }

  let newManualDescription =
    body.manualDescription !== undefined ? body.manualDescription : existing.manualDescription;
  let newAiSummary = body.aiSummary !== undefined ? body.aiSummary : existing.aiSummary;
  let oneLineSummary: string | undefined;

  if (body.consolidate) {
    try {
      const settings = await readSettings();
      const routingConf = settings.routing.characterCardConsolidator;
      if (!routingConf) {
        return c.json(
          {
            code: "ROUTING_NOT_CONFIGURED",
            message: "character-card-consolidator routing not configured",
          },
          400,
        );
      }
      const router = buildRouter(settings);
      const result = await consolidateCharacter({
        router,
        policy: toRouterPolicy(routingConf),
        fields: updatedFields,
      });
      // M5: consolidate 只覆寫 aiSummary，永不動 manualDescription
      newAiSummary = result.aiSummary;
      oneLineSummary = result.oneLineSummary;
      updatedFields = {
        ...updatedFields,
        consolidatedAt: new Date().toISOString(),
        consolidatedBy: routingConf.primary,
        manuallyEditedSections: {
          ...updatedFields.manuallyEditedSections,
          aiSummary: false, // consolidate 寫入後 aiSummary 視為「AI 來源」（直到使用者再次編輯）
        },
      };
    } catch (err) {
      return c.json(
        { code: "LLM_FAILED", message: err instanceof Error ? err.message : "LLM call failed" },
        502,
      );
    }
  }

  const updated = await updateCharacter(projectPath, slug, {
    fields: updatedFields,
    manualDescription: newManualDescription,
    aiSummary: newAiSummary,
    ...(oneLineSummary !== undefined ? { oneLineSummary } : {}),
  });

  if (!updated) {
    return c.json({ code: "CHARACTER_NOT_FOUND", message: "Character not found" }, 404);
  }

  await commitIfChanged(projectPath, "character", `edit ${slug}`);

  return c.json(responseFor(updated, slug));
});

// DELETE /api/projects/:projectHash/characters/:slug
app.delete("/:slug", async (c) => {
  const projectPath = await getProjectPath(c);
  if (!projectPath) {
    return c.json({ code: "PROJECT_NOT_FOUND", message: "Project not found" }, 404);
  }
  const slug = c.req.param("slug");
  const deleted = await deleteCharacter(projectPath, slug);
  if (!deleted) {
    return c.json({ code: "CHARACTER_NOT_FOUND", message: "Character not found" }, 404);
  }
  await commitIfChanged(projectPath, "character", `delete ${slug}`);
  return c.json({ deleted: true });
});

// POST /api/projects/:projectHash/characters/:slug/consolidate
app.post("/:slug/consolidate", zValidator("json", consolidateSchema), async (c) => {
  const projectPath = await getProjectPath(c);
  if (!projectPath) {
    return c.json({ code: "PROJECT_NOT_FOUND", message: "Project not found" }, 404);
  }
  const slug = c.req.param("slug");
  const body = c.req.valid("json");

  const char = await readCharacter(projectPath, slug);
  if (!char) {
    return c.json({ code: "CHARACTER_NOT_FOUND", message: "Character not found" }, 404);
  }

  const settings = await readSettings();
  const routingConf = settings.routing.characterCardConsolidator;
  if (!routingConf) {
    return c.json(
      {
        code: "ROUTING_NOT_CONFIGURED",
        message: "character-card-consolidator routing not configured",
      },
      400,
    );
  }

  const effectivePolicy = body.modelOverride
    ? { primary: body.modelOverride, fallbacks: routingConf.fallbacks }
    : routingConf;

  const router = buildRouter(settings);
  let result: ConsolidatorOutput;
  try {
    result = await consolidateCharacter({
      router,
      policy: toRouterPolicy(effectivePolicy),
      fields: char.fields,
    });
  } catch (err) {
    return c.json(
      { code: "LLM_FAILED", message: err instanceof Error ? err.message : "LLM call failed" },
      502,
    );
  }

  // M5: 此端點不寫檔，前端 textarea 預覽 → 使用者按儲存才送 PUT
  return c.json({
    aiSummary: result.aiSummary,
    oneLineSummary: result.oneLineSummary,
    consolidatedAt: new Date().toISOString(),
    consolidatedBy: effectivePolicy.primary,
    usage: { inputTokens: 0, outputTokens: 0 },
  });
});

function buildEmptyFields(name: string): CharacterFields {
  return {
    name,
    age: null,
    gender: null,
    pronoun: null,
    role: null,
    personalityTags: [],
    mbti: null,
    zodiac: null,
    bloodType: null,
    culturalBackground: null,
    heightCm: null,
    bodyType: null,
    hairAndColor: null,
    eyes: null,
    otherFeatures: null,
    clothing: null,
    portrait: { default: null, byChapter: {} },
    appearanceByChapter: {},
    dialoguePace: null,
    wordingPreference: null,
    writingAvoid: null,
    relations: null,
    sexualScenePerformance: null,
    consolidatedAt: null,
    consolidatedBy: null,
    manuallyEditedSections: { manualDescription: false, aiSummary: false },
  };
}

export { app as charactersRouter };
