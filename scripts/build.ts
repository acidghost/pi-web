import { chmod, rm } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const entrypoint = join(root, "app", "server.ts");

const compileTargets = {
  "linux-amd64": "bun-linux-x64",
  "linux-arm64": "bun-linux-arm64",
  "darwin-arm64": "bun-darwin-arm64",
} as const;

type ReleaseTarget = keyof typeof compileTargets;

function gitValue(...args: string[]): string | undefined {
  const result = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "ignore" });
  if (result.exitCode !== 0) return undefined;
  return new TextDecoder().decode(result.stdout).trim() || undefined;
}

function buildConfig() {
  const targetName = process.env.PI_WEB_BUILD_TARGET;
  if (targetName && !(targetName in compileTargets)) {
    throw new Error(
      `Unsupported PI_WEB_BUILD_TARGET ${JSON.stringify(targetName)}; expected one of ${Object.keys(compileTargets).join(", ")}`,
    );
  }

  const suppliedVersion = process.env.PI_WEB_BUILD_VERSION;
  if (targetName && !suppliedVersion) {
    throw new Error("Cross-platform release builds require PI_WEB_BUILD_VERSION");
  }

  const commit = process.env.PI_WEB_BUILD_COMMIT || gitValue("rev-parse", "HEAD") || "unknown";
  const version =
    suppliedVersion || `SNAPSHOT-${gitValue("rev-parse", "--short=12", "HEAD") || "unknown"}`;
  const outdir = resolve(root, process.env.PI_WEB_BUILD_OUTDIR || "dist");
  if (relative(root, outdir).startsWith("..")) {
    throw new Error("PI_WEB_BUILD_OUTDIR must be inside the repository");
  }

  return {
    commit,
    outdir,
    target: targetName ? compileTargets[targetName as ReleaseTarget] : undefined,
    version,
  };
}

async function buildExecutable() {
  const started = performance.now();
  const { commit, outdir, target, version } = buildConfig();
  const outfile = join(outdir, "pi-web");
  await rm(outdir, { recursive: true, force: true });

  const result = await Bun.build({
    define: {
      __PI_WEB_BUILD_COMMIT__: JSON.stringify(commit),
      __PI_WEB_BUILD_VERSION__: JSON.stringify(version),
    },
    minify: true,
    compile: {
      outfile,
      autoloadDotenv: false,
      ...(target ? { target } : {}),
    },
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

if (import.meta.main) await buildExecutable();
