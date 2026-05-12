import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface RuntimeInfo {
  port: number;
  pid: number;
  startedAt: string;
}

export async function writeRuntimeInfo(info: { port: number; pid: number }): Promise<void> {
  const dir = join(homedir(), ".novel-writer");
  await mkdir(dir, { recursive: true });

  const runtimeInfo: RuntimeInfo = {
    port: info.port,
    pid: info.pid,
    startedAt: new Date().toISOString(),
  };

  const filePath = join(dir, ".runtime.json");
  await writeFile(filePath, JSON.stringify(runtimeInfo, null, 2), "utf-8");
}
