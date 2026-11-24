import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

for (const file of ["../model.mjs", "../probe.mjs", "./worker.mjs"]) {
  const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");
  process.stdout.write(source.replace(/^import .*;\n/gm, "") + "\n");
}
