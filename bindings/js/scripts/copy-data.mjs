// Copy the embedded data tables (src/_data) into dist/_data so the published
// package can read them at runtime relative to the compiled module URL.
import { cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const src = join(root, "src", "_data");
const dst = join(root, "dist", "_data");

if (!existsSync(src)) {
  console.error(`missing data dir: ${src}`);
  process.exit(1);
}
cpSync(src, dst, { recursive: true });
console.log(`copied ${src} -> ${dst}`);
