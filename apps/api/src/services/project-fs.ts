import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CharacterCard, CreateNovelRequest, ProjectMeta } from "@novel-writer/shared-types";
import yaml from "js-yaml";
import { sanitizeSlug } from "./sanitize.js";

export interface CreatedProject {
  projectPath: string;
  firstChapterPath: string;
  firstChapterNumber: 1;
  firstChapterTitle: "未命名";
  meta: ProjectMeta;
  characters: CharacterCard[];
}

function resolveSlugs(inputs: Array<{ name: string; description: string }>): CharacterCard[] {
  const used = new Set<string>();
  return inputs.map((c) => {
    const base = sanitizeSlug(c.name);
    let slug = base;
    let n = 2;
    while (used.has(slug)) {
      slug = `${base}-${n}`;
      n++;
    }
    used.add(slug);
    return { slug, name: c.name, description: c.description };
  });
}

function buildIndexMd(characters: CharacterCard[]): string {
  const lines = ["# 角色索引", ""];
  for (const c of characters) {
    lines.push(`- [${c.name}](./${c.slug}.md) — ${c.description}`);
  }
  return `${lines.join("\n")}\n`;
}

function buildCharacterMd(c: CharacterCard): string {
  return `# ${c.name}\n\n## 描寫\n\n${c.description}\n`;
}

export async function createProjectFiles(
  req: CreateNovelRequest,
  projectPath: string,
): Promise<CreatedProject> {
  const characters = resolveSlugs(req.characters);
  const meta: ProjectMeta = {
    title: req.title,
    createdAt: new Date().toISOString(),
    schemaVersion: 1,
    chapterNumbering: { digits: 4 },
  };

  try {
    await mkdir(join(projectPath, "characters"), { recursive: true });
    await mkdir(join(projectPath, "chapters"), { recursive: true });
    await mkdir(join(projectPath, "status"), { recursive: true });
    await mkdir(join(projectPath, "agents"), { recursive: true });
    await mkdir(join(projectPath, "skills"), { recursive: true });

    const firstChapterFile = "chapter_0001_未命名.md";
    const firstChapterPath = join(projectPath, "chapters", firstChapterFile);

    await Promise.all([
      writeFile(join(projectPath, "project.yaml"), yaml.dump(meta, { lineWidth: -1 }), "utf-8"),
      writeFile(join(projectPath, "synopsis.md"), `${req.synopsis}\n`, "utf-8"),
      writeFile(join(projectPath, "characters", "_index.md"), buildIndexMd(characters), "utf-8"),
      ...characters.map((c) =>
        writeFile(join(projectPath, "characters", `${c.slug}.md`), buildCharacterMd(c), "utf-8"),
      ),
      writeFile(firstChapterPath, "", "utf-8"),
      writeFile(join(projectPath, "status", "story_status.md"), "", "utf-8"),
      writeFile(join(projectPath, "status", "character_status.md"), "", "utf-8"),
    ]);

    return {
      projectPath,
      firstChapterPath,
      firstChapterNumber: 1,
      firstChapterTitle: "未命名",
      meta,
      characters,
    };
  } catch (err) {
    await rm(projectPath, { recursive: true, force: true });
    throw err;
  }
}
