import { chmod, cp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const outdir = join(root, "dist");
const outfile = join(outdir, "pi-web");
const entrypoint = join(root, "app", "server.ts");

async function buildExecutable() {
  const started = performance.now();
  await rm(outdir, { recursive: true, force: true });

  const result = await Bun.build({
    compile: { outfile },
    target: "bun",
    entrypoints: [entrypoint],
  });

  for (const m of result.logs) {
    const pos = m.position?.file ? ` :: ${m.position.file}:${m.position.line}` : "";
    console.log(`[build] ${m.level} :: ${m.message}${pos}`);
  }

  if (!result.success) process.exit(1);

  await chmod(outfile, 0o755);
  console.log(`[build] wrote ${outfile} in ${Math.round(performance.now() - started)}ms`);
}

async function bundleFiles() {
  const started = performance.now();
  await cp(
    join(root, "node_modules", "@earendil-works", "pi-coding-agent", "package.json"),
    join(outdir, "package.json"),
  );
  console.log(`[build] wrote files in ${Math.round(performance.now() - started)}ms`);
}

if (import.meta.main) await buildExecutable().then(bundleFiles);
