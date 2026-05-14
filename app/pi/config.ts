import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { AppConfig, SupportedToolName } from "./types.ts";

const SUPPORTED_TOOLS = new Set<SupportedToolName>(["read", "bash"]);
const THINKING_LEVELS = new Set<ThinkingLevel>([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);

function parsePort(value: string | undefined): number {
  if (!value) return 3000;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `PI_WEB_PORT must be an integer from 1 to 65535 (got ${JSON.stringify(value)})`,
    );
  }
  return port;
}

function expandTilde(path: string): string {
  if (path === "~") return process.env.HOME || path;
  if (path.startsWith("~/")) return `${process.env.HOME || "~"}${path.slice(1)}`;
  return path;
}

function parseCwd(value: string | undefined): string {
  const cwd = resolve(expandTilde(value?.trim() || process.cwd()));
  if (!existsSync(cwd)) throw new Error(`PI_WEB_CWD does not exist: ${cwd}`);
  if (!statSync(cwd).isDirectory()) throw new Error(`PI_WEB_CWD is not a directory: ${cwd}`);
  return cwd;
}

function parseTools(value: string | undefined): SupportedToolName[] {
  const rawTools = (value?.trim() ? value : "read,bash")
    .split(",")
    .map((tool) => tool.trim())
    .filter(Boolean);

  if (rawTools.length === 0) throw new Error("PI_WEB_TOOLS must include at least one tool");

  const unique = [...new Set(rawTools)];
  for (const tool of unique) {
    if (!SUPPORTED_TOOLS.has(tool as SupportedToolName)) {
      throw new Error(
        `Unsupported PI_WEB_TOOLS entry ${JSON.stringify(tool)}. MVP supports only: read,bash`,
      );
    }
  }
  return unique as SupportedToolName[];
}

function parseThinkingLevel(value: string | undefined): ThinkingLevel | undefined {
  const level = value?.trim();
  if (!level) return undefined;
  if (!THINKING_LEVELS.has(level as ThinkingLevel)) {
    throw new Error(`PI_WEB_THINKING must be one of: ${[...THINKING_LEVELS].join(", ")}`);
  }
  return level as ThinkingLevel;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const provider = env.PI_WEB_PROVIDER?.trim() || undefined;
  const modelId = env.PI_WEB_MODEL?.trim() || undefined;

  if ((provider && !modelId) || (!provider && modelId)) {
    throw new Error(
      "PI_WEB_PROVIDER and PI_WEB_MODEL must be set together to select a model explicitly",
    );
  }

  return {
    port: parsePort(env.PI_WEB_PORT),
    host: env.PI_WEB_HOST ?? "localhost",
    cwd: parseCwd(env.PI_WEB_CWD),
    agentDir: env.PI_WEB_AGENT_DIR?.trim()
      ? resolve(expandTilde(env.PI_WEB_AGENT_DIR.trim()))
      : undefined,
    provider,
    modelId,
    thinkingLevel: parseThinkingLevel(env.PI_WEB_THINKING),
    tools: parseTools(env.PI_WEB_TOOLS),
  };
}
