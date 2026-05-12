import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { health } from "./routes/health.js";
import { writeRuntimeInfo } from "./lib/runtime-info.js";
import { logger } from "./lib/logger.js";

const app = new Hono().route("/api/health", health);

export type AppType = typeof app;

const server = serve(
  { fetch: app.fetch, port: 0, hostname: "127.0.0.1" },
  (info) => {
    const port = info.port;
    logger.info(`Sidecar ready on port ${port}`);
    process.stdout.write(`READY ${port}\n`);
    void writeRuntimeInfo({ port, pid: process.pid });
  },
);

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down");
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down");
  server.close(() => process.exit(0));
});
