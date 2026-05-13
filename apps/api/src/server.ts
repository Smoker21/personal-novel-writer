import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "./lib/logger.js";
import { writeRuntimeInfo } from "./lib/runtime-info.js";
import { adoptRouter } from "./routes/adopt.js";
import { chapters } from "./routes/chapters.js";
import { charactersRouter } from "./routes/characters.js";
import { draftRouter } from "./routes/draft.js";
import { generateRouter } from "./routes/generate.js";
import { git } from "./routes/git.js";
import { health } from "./routes/health.js";
import { jobsRouter } from "./routes/jobs.js";
import { novels } from "./routes/novels.js";
import { portraitsRouter } from "./routes/portraits.js";
import { projectFileRouter } from "./routes/project-file.js";
import { projects } from "./routes/projects.js";
import { settings } from "./routes/settings.js";
import { statusRouter } from "./routes/status.js";
import { unadoptRouter } from "./routes/unadopt.js";

const app = new Hono()
  .route("/api/health", health)
  .route("/api/settings", settings)
  .route("/api/git", git)
  .route("/api/novels", novels)
  .route("/api/projects", projects)
  .route("/api/projects/:hash/chapters", chapters)
  .route("/api/projects/:hash/characters", charactersRouter)
  .route("/api/projects/:hash/characters/:slug/portraits", portraitsRouter)
  .route("/api/projects/:hash/chapters/:chapterNumber/generate", generateRouter)
  .route("/api/projects/:hash/chapters/:chapterNumber/draft", draftRouter)
  .route("/api/projects/:hash/chapters/:chapterNumber/adopt", adoptRouter)
  .route("/api/projects/:hash/chapters/:chapterNumber/unadopt", unadoptRouter)
  .route("/api/projects/:hash/file", projectFileRouter)
  .route("/api/projects/:hash/status", statusRouter)
  .route("/api/projects/:hash/jobs", jobsRouter);

export type AppType = typeof app;

const port = Number.parseInt(process.env["PORT"] ?? "0", 10);

const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
  const actualPort = info.port;
  logger.info(`Sidecar ready on port ${actualPort}`);
  process.stdout.write(`READY ${actualPort}\n`);
  void writeRuntimeInfo({ port: actualPort, pid: process.pid });
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down");
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down");
  server.close(() => process.exit(0));
});
