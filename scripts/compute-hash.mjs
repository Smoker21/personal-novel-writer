import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, normalize } from "node:path";

// Read actual settings.yaml manually (no yaml parser needed for simple case)
const settingsPath = join(homedir(), ".novel-writer", "settings.yaml");
const raw = await readFile(settingsPath, "utf-8");

// Extract recentProjects entries manually
const _hashMatches = raw.match(/hash: ([a-f0-9]+)/g) || [];
const _pathMatches = raw.match(/path: (.+)/g) || [];
const _titleMatches = raw.match(/title: (.+)/g) || [];

// Better: use the API to get settings, then compute hashes
import http from "node:http";

const settings = await new Promise((resolve, reject) => {
  http
    .get("http://127.0.0.1:3001/api/settings", (res) => {
      let b = "";
      res.on("data", (c) => (b += c));
      res.on("end", () => resolve(JSON.parse(b)));
    })
    .on("error", reject);
});

console.log("Recent projects from API:");
for (const p of settings.recentProjects) {
  const storedPath = p.path;
  const normalizedPath = normalize(storedPath);
  const fullHash = createHash("sha256").update(normalizedPath).digest("hex");
  const h8 = fullHash.slice(0, 8);
  const h16 = fullHash.slice(0, 16);
  console.log(`\ntitle: ${p.title}`);
  console.log(`  stored_path: "${storedPath}"`);
  console.log(`  normalized:  "${normalizedPath}"`);
  console.log(`  stored_hash: ${p.hash}`);
  console.log(`  hash8_of_norm: ${h8}`);
  console.log(`  hash16_of_norm: ${h16}`);
  console.log(`  → use this URL hash: ${h8}`);
  console.log(`  match: hash==h8: ${p.hash === h8}, hash==h16: ${p.hash === h16}`);
}
