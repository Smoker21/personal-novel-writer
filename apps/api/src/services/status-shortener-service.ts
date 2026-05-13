import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildStatusShortenerRequest,
  statusShortenerOutputSchema,
} from "@novel-writer/prompt-library";
import type { StatusShortenRequest, StatusShortenResponse } from "@novel-writer/shared-types";
import { buildRouter, toRouterPolicy } from "./router-factory.js";
import { readSettings } from "./settings-store.js";

export async function shortenStatusFile(
  projectPath: string,
  req: StatusShortenRequest,
): Promise<StatusShortenResponse> {
  const filePath =
    req.fileType === "story"
      ? join(projectPath, "status", "story_status.md")
      : join(projectPath, "characters", `${req.characterSlug ?? ""}_status.md`);

  const fileContent = await readFile(filePath, "utf-8").catch(() => "");
  if (!fileContent.trim()) {
    throw Object.assign(new Error("Status file is empty or not found"), {
      code: "FILE_NOT_FOUND",
    });
  }

  const settings = await readSettings();
  const routingConf = settings.routing.statusUpdater;
  if (!routingConf) {
    throw Object.assign(new Error("statusUpdater routing not configured"), {
      code: "ROUTING_NOT_CONFIGURED",
    });
  }

  const effectiveModelId = req.modelOverride ?? routingConf.primary;
  const genReq = buildStatusShortenerRequest(
    {
      fileContent,
      fileType: req.fileType,
      preserveMarkedSections: req.preserveMarkedSections,
      ...(req.characterSlug !== undefined ? { characterSlug: req.characterSlug } : {}),
    },
    effectiveModelId,
  );

  const router = buildRouter(settings);
  const response = await router.generate(
    genReq,
    toRouterPolicy({ ...routingConf, primary: effectiveModelId }),
  );
  const cleaned = response.text
    .trim()
    .replace(/^```(?:json)?\n?([\s\S]*?)\n?```$/m, "$1")
    .trim();
  return statusShortenerOutputSchema.parse(JSON.parse(cleaned));
}
