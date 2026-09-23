// 临时逻辑自检：node scripts/logic-check.mjs（用 vite 自带 esbuild 即时转译）
import { build as esbuild } from "esbuild";
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";

const result = await esbuild({
  entryPoints: ["src/__checks__/run.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  loader: { ".ts": "ts" },
});
const code = result.outputFiles[0].text;
writeFileSync("/tmp/__shift_check.mjs", code);
await import(pathToFileURL("/tmp/__shift_check.mjs").href);
