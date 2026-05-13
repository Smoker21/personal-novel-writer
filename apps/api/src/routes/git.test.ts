import { describe, expect, it } from "vitest";
import { git } from "./git.js";

describe("git routes", () => {
  it("GET /check-binary returns installed=true on this machine", async () => {
    const res = await git.request("/check-binary");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { installed: boolean };
    expect(body.installed).toBe(true);
  });

  it("GET /projects/:hash/status returns 404 when unknown hash", async () => {
    const res = await git.request("/projects/nonexistenthash1234abcd/status");
    expect(res.status).toBe(404);
  });
});
