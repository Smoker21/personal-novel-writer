import { access, readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import yaml from "js-yaml";
import type { ProjectMeta, ProjectOpenWarning } from "@novel-writer/shared-types";

const APP_SUPPORTED_SCHEMA = 1;

export type ValidationErrorCode =
  | "INVALID_PATH"
  | "PATH_NOT_FOUND"
  | "MISSING_PROJECT_YAML"
  | "CORRUPTED_PROJECT_YAML"
  | "SCHEMA_VERSION_TOO_NEW";

export interface ValidationError {
  code: ValidationErrorCode;
  status: number;
}

export interface ValidationOk {
  meta: ProjectMeta;
  warnings: ProjectOpenWarning[];
}

const STATUS_MAP: Record<ValidationErrorCode, number> = {
  INVALID_PATH: 400,
  PATH_NOT_FOUND: 404,
  MISSING_PROJECT_YAML: 422,
  CORRUPTED_PROJECT_YAML: 422,
  SCHEMA_VERSION_TOO_NEW: 422,
};

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function validateProject(
  path: string,
  forceOpen: boolean,
): Promise<
  | { ok: true; data: ValidationOk }
  | { ok: false; error: ValidationError; message: string }
> {
  if (!isAbsolute(path) || path.includes("..")) {
    return {
      ok: false,
      error: { code: "INVALID_PATH", status: STATUS_MAP["INVALID_PATH"] },
      message: "path must be absolute and free of traversal segments",
    };
  }

  if (!(await fileExists(path))) {
    return {
      ok: false,
      error: { code: "PATH_NOT_FOUND", status: STATUS_MAP["PATH_NOT_FOUND"] },
      message: `path not found: ${path}`,
    };
  }

  const yamlPath = join(path, "project.yaml");
  if (!(await fileExists(yamlPath))) {
    return {
      ok: false,
      error: {
        code: "MISSING_PROJECT_YAML",
        status: STATUS_MAP["MISSING_PROJECT_YAML"],
      },
      message: `not a novel-writer project: project.yaml not found at ${path}`,
    };
  }

  let meta: ProjectMeta;
  try {
    const raw = await readFile(yamlPath, "utf-8");
    const parsed = yaml.load(raw) as Partial<ProjectMeta> | null;
    if (
      !parsed ||
      typeof parsed.title !== "string" ||
      typeof parsed.schemaVersion !== "number"
    ) {
      throw new Error("missing required fields");
    }
    meta = {
      title: parsed.title,
      createdAt: parsed.createdAt ?? new Date().toISOString(),
      schemaVersion: parsed.schemaVersion as 1,
    };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "CORRUPTED_PROJECT_YAML",
        status: STATUS_MAP["CORRUPTED_PROJECT_YAML"],
      },
      message:
        err instanceof Error ? err.message : "yaml parse failed",
    };
  }

  if (meta.schemaVersion > APP_SUPPORTED_SCHEMA && !forceOpen) {
    return {
      ok: false,
      error: {
        code: "SCHEMA_VERSION_TOO_NEW",
        status: STATUS_MAP["SCHEMA_VERSION_TOO_NEW"],
      },
      message: `schemaVersion ${meta.schemaVersion} is newer than supported (${APP_SUPPORTED_SCHEMA})`,
    };
  }

  const warnings: ProjectOpenWarning[] = [];

  if (meta.schemaVersion < APP_SUPPORTED_SCHEMA) {
    warnings.push({
      code: "outdated_schema",
      message: `schemaVersion ${meta.schemaVersion} is older than current (${APP_SUPPORTED_SCHEMA})`,
    });
  }

  // optional files
  const optionalChecks: Array<{ file: string; label: string }> = [
    { file: "style.md", label: "style.md" },
    { file: "characters/_index.md", label: "characters/_index.md" },
    { file: "status/story_status.md", label: "status/story_status.md" },
  ];
  for (const check of optionalChecks) {
    if (!(await fileExists(join(path, check.file)))) {
      warnings.push({
        code: "missing_optional_file",
        message: `${check.label} is missing`,
      });
    }
  }

  // git repo check
  if (!(await fileExists(join(path, ".git")))) {
    warnings.push({
      code: "no_git_repo",
      message: "directory is not a git repository",
      suggestedAction: "initialize git for version control",
      fixAction: { type: "init_git" },
    });
  }

  return { ok: true, data: { meta, warnings } };
}
