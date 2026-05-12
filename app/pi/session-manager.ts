import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager as PiSessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { BrowserEvent } from "@shared/protocol";
import { broadcast, mapAgentEvent, sessionStateEvent } from "./streaming.ts";
import type { AppConfig, AppServices, SseSubscriber, WebSession } from "./types.ts";

export const webSessions = new Map<string, WebSession>();

export function createServices(config: AppConfig): AppServices {
  const authStorage = AuthStorage.create(
    config.agentDir ? join(config.agentDir, "auth.json") : undefined,
  );
  const modelRegistry = ModelRegistry.create(
    authStorage,
    config.agentDir ? join(config.agentDir, "models.json") : undefined,
  );
  const settingsManager = SettingsManager.create(config.cwd, config.agentDir);

  const explicitModel = resolveExplicitModel(config, modelRegistry);

  return { authStorage, modelRegistry, settingsManager, explicitModel };
}

function resolveExplicitModel(
  config: AppConfig,
  modelRegistry: ModelRegistry,
): Model<Api> | undefined {
  if (!config.provider || !config.modelId) return undefined;
  const model = modelRegistry.find(config.provider, config.modelId);
  if (!model) throw new Error(`Configured model not found: ${config.provider}/${config.modelId}`);
  return model;
}

export async function createWebSession(
  config: AppConfig,
  services: AppServices,
): Promise<WebSession> {
  const id = crypto.randomUUID();
  const now = Date.now();

  const { session } = await createAgentSession({
    cwd: config.cwd,
    agentDir: config.agentDir,
    authStorage: services.authStorage,
    modelRegistry: services.modelRegistry,
    settingsManager: services.settingsManager,
    sessionManager: PiSessionManager.inMemory(config.cwd),
    tools: config.tools,
    model: services.explicitModel,
    thinkingLevel: config.thinkingLevel,
  });

  const webSession: WebSession = {
    id,
    session,
    unsubscribe: () => undefined,
    subscribers: new Set<SseSubscriber>(),
    createdAt: now,
    updatedAt: now,
  };

  webSession.unsubscribe = session.subscribe((event) => {
    try {
      for (const browserEvent of mapAgentEvent(webSession, event)) {
        broadcast(webSession, browserEvent);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifyError(webSession, message);
    }
  });

  webSessions.set(id, webSession);
  return webSession;
}

export function getWebSession(id: string): WebSession | undefined {
  return webSessions.get(id);
}

export function addSubscriber(webSession: WebSession, subscriber: SseSubscriber): void {
  webSession.subscribers.add(subscriber);
  subscriber.send(sessionStateEvent(webSession));
}

export function removeSubscriber(webSession: WebSession, subscriber: SseSubscriber): void {
  webSession.subscribers.delete(subscriber);
}

export function notifyError(webSession: WebSession, message: string): void {
  webSession.lastError = message;
  webSession.updatedAt = Date.now();
  broadcast(webSession, { type: "error", message });
}

export function notifyState(webSession: WebSession): void {
  webSession.updatedAt = Date.now();
  broadcast(webSession, sessionStateEvent(webSession));
}

export function modelToJson(model: Model<Api> | undefined) {
  if (!model) return null;
  return {
    provider: model.provider,
    id: model.id,
    name: model.name,
  };
}

export function sessionMetadata(config: AppConfig, webSession: WebSession) {
  return {
    id: webSession.id,
    cwd: config.cwd,
    createdAt: webSession.createdAt,
    updatedAt: webSession.updatedAt,
    isStreaming: webSession.session.isStreaming,
    thinkingLevel: webSession.session.thinkingLevel,
    model: modelToJson(webSession.session.model),
  };
}

export async function disposeAllSessions(): Promise<void> {
  for (const webSession of webSessions.values()) {
    webSession.unsubscribe();
    webSession.session.dispose();
  }
  webSessions.clear();
}

export function toBrowserError(error: unknown): BrowserEvent {
  return { type: "error", message: error instanceof Error ? error.message : String(error) };
}
