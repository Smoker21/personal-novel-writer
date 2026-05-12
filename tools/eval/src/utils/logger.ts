import { consola } from "consola";

export const logger = consola.withTag("eval");

export function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(2)}s`;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}m${r.toFixed(0)}s`;
}
