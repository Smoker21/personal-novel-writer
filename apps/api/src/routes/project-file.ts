import { stat } from "node:fs/promises";
import { join, normalize, resolve } from "node:path";
import { Hono } from "hono";
import { resolveProjectPath } from "../services/project-resolver.js";

const app = new Hono();

/**
 * Serve a file from within a project directory.
 * URL: /api/projects/:hash/file?path=relative/to/project/root
 * Used by frontend to display portrait images.
 */
app.get("/", async (c) => {
  const projectHash = c.req.param("hash") ?? "";
  const relativePath = c.req.query("path") ?? "";

  if (!relativePath) {
    return c.json({ code: "MISSING_PATH" }, 400);
  }

  const projectPath = await resolveProjectPath(projectHash);
  if (!projectPath) return c.json({ code: "PROJECT_NOT_FOUND" }, 404);

  // Security: ensure the resolved path stays inside the project directory
  const absProjectPath = resolve(projectPath);
  const absFilePath = resolve(join(projectPath, relativePath));

  if (!absFilePath.startsWith(absProjectPath + normalize("/"))) {
    return c.json({ code: "PATH_TRAVERSAL" }, 400);
  }

  let fileStat: Awaited<ReturnType<typeof stat>>;
  try {
    fileStat = await stat(absFilePath);
  } catch {
    return c.json({ code: "NOT_FOUND" }, 404);
  }

  if (!fileStat.isFile()) {
    return c.json({ code: "NOT_A_FILE" }, 400);
  }

  const ext = absFilePath.split(".").pop()?.toLowerCase() ?? "";
  const mimeType =
    ext === "jpg" || ext === "jpeg"
      ? "image/jpeg"
      : ext === "png"
        ? "image/png"
        : ext === "webp"
          ? "image/webp"
          : "application/octet-stream";

  const { createReadStream } = await import("node:fs");
  const stream = createReadStream(absFilePath);

  return new Response(stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(fileStat.size),
      "Cache-Control": "private, max-age=3600",
    },
  });
});

export { app as projectFileRouter };
