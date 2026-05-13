import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { subscribeJob } from "../services/job-event-bus.js";

const app = new Hono();

// GET /api/projects/:hash/jobs/:jobId/events
app.get("/:jobId/events", async (c) => {
  const jobId = c.req.param("jobId") ?? "";
  return streamSSE(c, async (stream) => {
    for await (const event of subscribeJob(jobId)) {
      await stream.writeSSE({
        event: event.type,
        data: JSON.stringify(event),
      });
      if (event.type === "completed" || event.type === "failed") break;
    }
  });
});

export { app as jobsRouter };
