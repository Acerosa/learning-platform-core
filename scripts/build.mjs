import { build } from "esbuild";
import { copyFile, mkdir, rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

const shared = {
  bundle: true,
  sourcemap: true,
  target: ["es2020"],
  legalComments: "none"
};

await Promise.all([
  build({
    ...shared,
    entryPoints: ["src/index.js"],
    outfile: "dist/learning-platform-core.esm.js",
    format: "esm"
  }),
  build({
    ...shared,
    entryPoints: ["src/index.js"],
    outfile: "dist/learning-platform-core.iife.js",
    format: "iife",
    globalName: "LearningPlatformCore"
  }),
  build({
    ...shared,
    entryPoints: ["src/conformance/index.js"],
    outfile: "dist/conformance.esm.js",
    format: "esm"
  }),
  build({
    ...shared,
    entryPoints: ["src/advanced.js"],
    outfile: "dist/advanced.esm.js",
    format: "esm"
  }),
  copyFile("src/theme/tokens.css", "dist/tokens.css"),
  copyFile("src/theme/theme.css", "dist/theme.css")
]);
