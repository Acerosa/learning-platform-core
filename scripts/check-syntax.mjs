import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { extname, join } from "node:path";

const roots = ["src", "scripts", "tests"];
const files = [];

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if ([".js", ".mjs"].includes(extname(entry.name))) files.push(path);
  }
}

for (const root of roots) await collect(root);

for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
}

console.log(`Syntax check passed for ${files.length} JavaScript files.`);
