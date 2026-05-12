import { Hono } from "hono";

export const health = new Hono().get("/", (c) =>
  c.json({ ok: true, version: "0.1.0-dev" }),
);
