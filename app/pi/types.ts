import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import type {
  AgentSession,
  AuthStorage,
  ModelRegistry,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { BrowserEvent } from "@shared/protocol";

export type SupportedToolName = "read" | "bash";

export interface AppConfig {
  port: number;
  host: string;
  cwd: string;
  agentDir?: string;
  provider?: string;
  modelId?: string;
  thinkingLevel?: ThinkingLevel;
  tools: SupportedToolName[];
}

export interface AppServices {
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
  settingsManager: SettingsManager;
  explicitModel?: Model<Api>;
}

export interface SseSubscriber {
  id: string;
  send: (event: BrowserEvent) => void;
}

export interface WebSession {
  id: string;
  session: AgentSession;
  unsubscribe: () => void;
  subscribers: Set<SseSubscriber>;
  createdAt: number;
  updatedAt: number;
  lastError?: string;
  currentAssistantMessageId?: string;
}
