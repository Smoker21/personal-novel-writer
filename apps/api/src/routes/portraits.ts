import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { readCharacter, updatePortraitFields } from "../services/character-fs.js";
import { extractPortraitAppearance } from "../services/character-image-extract.js";
import { commitIfChanged } from "../services/commit-policy.js";
import { deletePortrait, listPortraits, savePortrait } from "../services/portrait-fs.js";
import { resolveProjectPath } from "../services/project-resolver.js";
import { buildRouter, toRouterPolicy } from "../services/router-factory.js";
import { readSettings } from "../services/settings-store.js";

const app = new Hono();

const extractSchema = z.object({
  scope: z.enum(["default", "chapter"]),
  chapterNumber: z.number().nullable(),
  modelOverride: z.string().optional(),
});

const deleteSchema = z.object({
  scope: z.enum(["default", "chapter"]),
  chapterNumber: z.number().nullable(),
});

// POST .../portraits  (multipart upload)
app.post("/", async (c) => {
  const projectPath = await resolveProjectPath(c.req.param("hash") ?? "");
  if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);
  const slug = c.req.param("slug") ?? "";

  const char = await readCharacter(projectPath, slug);
  if (!char) return c.json({ code: "CHARACTER_NOT_FOUND" }, 404);

  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ code: "INVALID_FORMAT", message: "Multipart form data required" }, 400);
  }

  const imageFile = formData.get("image") as File | null;
  const scopeRaw = formData.get("scope");
  const scope = scopeRaw === "chapter" ? ("chapter" as const) : ("default" as const);
  const chapterNumberRaw = formData.get("chapterNumber");
  const chapterNumber = scope === "chapter" && chapterNumberRaw ? Number(chapterNumberRaw) : null;

  if (!imageFile) return c.json({ code: "INVALID_FORMAT", message: "image field required" }, 400);

  const mime = imageFile.type;
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) {
    return c.json({ code: "INVALID_FORMAT", message: "Only JPG/PNG/WebP accepted" }, 400);
  }
  if (imageFile.size > 10 * 1024 * 1024) {
    return c.json({ code: "FILE_TOO_LARGE", message: "File must be ≤ 10 MB" }, 400);
  }

  const buf = Buffer.from(await imageFile.arrayBuffer());
  let info: Awaited<ReturnType<typeof savePortrait>>;
  try {
    info = await savePortrait(projectPath, slug, scope, chapterNumber, buf, mime);
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    if (code === "INVALID_DIMENSIONS") {
      return c.json({ code, message: "Image must be at least 256×256 px" }, 400);
    }
    throw e;
  }

  // Update portrait frontmatter
  await updatePortraitFields(projectPath, slug, (fields) => {
    if (scope === "default") {
      return { ...fields, portrait: { ...fields.portrait, default: info.path } };
    }
    return {
      ...fields,
      portrait: {
        ...fields.portrait,
        byChapter: { ...fields.portrait.byChapter, [chapterNumber!]: info.path },
      },
    };
  });

  const sha = await commitIfChanged(projectPath, "character", `upload portrait ${slug}/${scope}`);
  return c.json({ ...info, commitSha: sha?.sha ?? "" }, 201);
});

// POST .../portraits/extract
app.post("/extract", zValidator("json", extractSchema), async (c) => {
  const projectPath = await resolveProjectPath(c.req.param("hash") ?? "");
  if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);
  const slug = c.req.param("slug") ?? "";
  const body = c.req.valid("json");

  const char = await readCharacter(projectPath, slug);
  if (!char) return c.json({ code: "CHARACTER_NOT_FOUND" }, 404);

  const portraitPath =
    body.scope === "default"
      ? char.fields.portrait.default
      : char.fields.portrait.byChapter[body.chapterNumber ?? 0];

  if (!portraitPath)
    return c.json(
      { code: "PORTRAIT_NOT_FOUND", message: "Portrait not uploaded for this scope" },
      404,
    );
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const resolvedPortraitPath = portraitPath as string;

  const settings = await readSettings();
  const routingConf = settings.routing.characterImageExtractor;
  if (!routingConf) {
    return c.json(
      {
        code: "ROUTING_NOT_CONFIGURED",
        message: "character-image-extractor routing not configured",
      },
      400,
    );
  }

  const effectivePolicy = body.modelOverride
    ? { primary: body.modelOverride, fallbacks: routingConf.fallbacks }
    : routingConf;

  const start = Date.now();
  const router = buildRouter(settings);

  let result: Awaited<ReturnType<typeof extractPortraitAppearance>>;
  try {
    result = await extractPortraitAppearance({
      projectPath,
      slug,
      scope: body.scope,
      chapterNumber: body.chapterNumber,
      imagePath: resolvedPortraitPath,
      router,
      policy: toRouterPolicy(effectivePolicy),
    });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === "content_blocked") {
      return c.json({ code: "LLM_FAILED", message: "Content blocked; try a local model" }, 502);
    }
    if (err.code === "CHARACTER_NOT_FOUND") {
      return c.json({ code: "CHARACTER_NOT_FOUND" }, 404);
    }
    return c.json({ code: "LLM_FAILED", message: err.message ?? String(e) }, 502);
  }

  const sha = await commitIfChanged(
    projectPath,
    "character",
    `extract appearance from portrait ${slug}/${body.scope}`,
  );

  return c.json({
    extracted: result.extracted,
    writtenTo: result.writtenTo,
    modelId: effectivePolicy.primary,
    durationMs: Date.now() - start,
    commitSha: sha?.sha ?? null,
  });
});

// DELETE .../portraits
app.delete("/", zValidator("json", deleteSchema), async (c) => {
  const projectPath = await resolveProjectPath(c.req.param("hash") ?? "");
  if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);
  const slug = c.req.param("slug") ?? "";
  const body = c.req.valid("json");

  const deleted = await deletePortrait(projectPath, slug, body.scope, body.chapterNumber);
  if (!deleted) return c.json({ code: "PORTRAIT_NOT_FOUND" }, 404);

  await updatePortraitFields(projectPath, slug, (fields) => {
    if (body.scope === "default") {
      return { ...fields, portrait: { ...fields.portrait, default: null } };
    }
    const n = body.chapterNumber!;
    const { [n]: _removedPortrait, ...restPortrait } = fields.portrait.byChapter;
    const { [n]: _removedApp, ...restApp } = fields.appearanceByChapter;
    void _removedPortrait;
    void _removedApp;
    return {
      ...fields,
      portrait: { ...fields.portrait, byChapter: restPortrait as Record<number, string> },
      appearanceByChapter: restApp as Record<number, string>,
    };
  });

  const sha = await commitIfChanged(
    projectPath,
    "character",
    `delete portrait ${slug}/${body.scope}`,
  );
  return c.json({ deleted: true, commitSha: sha?.sha ?? "" });
});

// GET .../portraits
app.get("/", async (c) => {
  const projectPath = await resolveProjectPath(c.req.param("hash") ?? "");
  if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);
  const slug = c.req.param("slug") ?? "";
  const result = await listPortraits(projectPath, slug);
  return c.json(result);
});

export { app as portraitsRouter };
