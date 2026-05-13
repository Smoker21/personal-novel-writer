import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "./lib/logger.js";
import { writeRuntimeInfo } from "./lib/runtime-info.js";
import { health } from "./routes/health.js";
import { settings } from "./routes/settings.js";

const app = new Hono().route("/api/health", health).route("/api/settings", settings);

export type AppType = typeof app;

// biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
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
