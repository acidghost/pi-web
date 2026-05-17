import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  type SessionInfo,
  SessionManager,
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

async function createWebSessionFromManager(
  config: AppConfig,
  services: AppServices,
  sessionManager: SessionManager,
  timestamps?: { createdAt?: number; updatedAt?: number },
): Promise<WebSession> {
  const now = Date.now();

  const { session, modelFallbackMessage } = await createAgentSession({
    cwd: config.cwd,
    agentDir: config.agentDir,
    authStorage: services.authStorage,
    modelRegistry: services.modelRegistry,
    settingsManager: services.settingsManager,
    sessionManager,
    tools: config.tools,
    model: services.explicitModel,
    thinkingLevel: config.thinkingLevel,
  });

  const id = session.sessionId;
  const existing = webSessions.get(id);
  if (existing) {
    session.dispose();
    return existing;
  }

  const webSession: WebSession = {
    id,
    session,
    unsubscribe: () => undefined,
    subscribers: new Set<SseSubscriber>(),
    createdAt: timestamps?.createdAt ?? now,
    updatedAt: timestamps?.updatedAt ?? now,
    lastError: modelFallbackMessage,
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

export async function createWebSession(
  config: AppConfig,
  services: AppServices,
): Promise<WebSession> {
  return createWebSessionFromManager(config, services, SessionManager.create(config.cwd));
}

async function findPersistedSession(
  config: AppConfig,
  id: string,
): Promise<SessionInfo | undefined> {
  const sessions = await SessionManager.list(config.cwd);
  return sessions.find((session) => session.id === id);
}

export async function getOrOpenWebSession(
  config: AppConfig,
  services: AppServices,
  id: string,
): Promise<WebSession | undefined> {
  const existing = getWebSession(id);
  if (existing) return existing;

  const info = await findPersistedSession(config, id);
  if (!info) return undefined;

  return createWebSessionFromManager(config, services, SessionManager.open(info.path), {
    createdAt: info.created.getTime(),
    updatedAt: info.modified.getTime(),
  });
}

export async function listWebSessions(config: AppConfig) {
  const activeIds = new Set(webSessions.keys());
  const persisted = await SessionManager.list(config.cwd);
  const items = persisted.map((info) => {
    const active = webSessions.get(info.id);
    activeIds.delete(info.id);
    return {
      id: info.id,
      name: info.name,
      firstMessage: info.firstMessage,
      createdAt: info.created.getTime(),
      updatedAt: active?.updatedAt ?? info.modified.getTime(),
      messageCount: info.messageCount,
      isActive: active !== undefined,
    };
  });

  for (const id of activeIds) {
    const active = webSessions.get(id);
    if (!active) continue;
    items.push({
      id,
      name: active.session.sessionName,
      firstMessage: "",
      createdAt: active.createdAt,
      updatedAt: active.updatedAt,
      messageCount: active.session.messages.length,
      isActive: true,
    });
  }

  return items.sort((a, b) => b.updatedAt - a.updatedAt);
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
    name: model.name || model.id,
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
