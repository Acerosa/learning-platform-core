import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export async function loadPagesHealthConfig(path) {
  const absolute = resolve(path);
  const raw = await readFile(absolute, "utf8");
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.targets)) return parsed.targets;
  if (parsed && typeof parsed === "object") return [parsed];
  throw new Error(`Unsupported pages health config shape in ${absolute}`);
}
