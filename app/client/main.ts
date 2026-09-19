import { BrowserEventSchema } from "@shared/protocol";
import { html, render } from "lit";
import "./app";
import {
  abortSession,
  createSession,
  getMessages,
  getModels,
  getSession,
  listSessions,
  sendPrompt,
  setSessionModel,
} from "./api";
import type { PiWebApp } from "./app";
import { appendOptimisticUserMessage, applyBrowserEvent, setMessages, state } from "./state";

let eventSource: EventSource | undefined;
let appElement: PiWebApp;
let refreshSessionsTimer: number | undefined;
let refreshSessionsRequest: Promise<void> | undefined;
let refreshSessionsQueued = false;
let sessionLoadGeneration = 0;

function renderApp() {
  appElement?.requestUpdate();
}

function setUrlSession(sessionId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("session", sessionId);
  window.history.replaceState({}, "", url);
}

function getUrlSession(): string | null {
  return new URL(window.location.href).searchParams.get("session");
}

function openEvents(sessionId: string) {
  eventSource?.close();
  const source = new EventSource(`/api/sessions/${encodeURIComponent(sessionId)}/events`);
  eventSource = source;

  source.onopen = () => {
    if (eventSource !== source) return;
    state.lastError = null;
    void refreshMetadata(sessionId);
  };

  source.onmessage = (message) => {
    if (eventSource !== source) return;
    try {
      const event = BrowserEventSchema.parse(JSON.parse(message.data));
      applyBrowserEvent(event);
      if (event.type === "session_state" || event.type === "agent_end") scheduleRefreshSessions();
      renderApp();
    } catch (error) {
      state.lastError = error instanceof Error ? error.message : String(error);
      renderApp();
    }
  };

  source.onerror = () => {
    if (eventSource !== source) return;
    state.lastError = "SSE disconnected; reconnecting…";
    renderApp();
  };
}

async function refreshMetadata(sessionId = state.sessionId) {
  if (!sessionId) return;
  const metadata = await getSession(sessionId);
  if (state.sessionId !== sessionId) return;
  state.metadata = metadata;
  state.isStreaming = metadata.isStreaming;
  renderApp();
}

async function refreshModels() {
  const response = await getModels();
  state.models = response.models;
  renderApp();
}

function updateSessionPolling() {
  if (!state.sessions.some((session) => session.isStreaming)) {
    if (refreshSessionsTimer !== undefined) window.clearTimeout(refreshSessionsTimer);
    refreshSessionsTimer = undefined;
    return;
  }
  scheduleRefreshSessions(1_000);
}

async function refreshSessions() {
  refreshSessionsQueued = true;
  if (refreshSessionsRequest) return refreshSessionsRequest;

  const request = (async () => {
    while (refreshSessionsQueued) {
      refreshSessionsQueued = false;
      const response = await listSessions();
      state.sessions = response.sessions;
      renderApp();
    }
  })();
  refreshSessionsRequest = request;

  try {
    await request;
  } finally {
    if (refreshSessionsRequest === request) refreshSessionsRequest = undefined;
    updateSessionPolling();
  }
}

function scheduleRefreshSessions(delay = 500) {
  if (refreshSessionsTimer !== undefined) window.clearTimeout(refreshSessionsTimer);
  refreshSessionsTimer = window.setTimeout(() => {
    refreshSessionsTimer = undefined;
    void refreshSessions().catch((error) => {
      console.warn("Failed to refresh sessions", error);
    });
  }, delay);
}

function beginSessionLoad(): number {
  const generation = ++sessionLoadGeneration;
  state.isLoadingSession = true;
  state.lastError = null;
  renderApp();
  return generation;
}

function failSessionLoad(generation: number, error: unknown) {
  if (generation !== sessionLoadGeneration) return;
  state.isLoadingSession = false;
  state.lastError = error instanceof Error ? error.message : String(error);
  renderApp();
}

async function loadSession(sessionId: string, generation = beginSessionLoad()): Promise<boolean> {
  try {
    const [metadata, history] = await Promise.all([getSession(sessionId), getMessages(sessionId)]);
    if (generation !== sessionLoadGeneration) return false;

    state.sessionId = sessionId;
    state.metadata = metadata;
    state.isStreaming = metadata.isStreaming;
    setMessages(history.agentMessages || []);
    setUrlSession(sessionId);
    openEvents(sessionId);
    state.isLoadingSession = false;
    renderApp();

    void refreshSessions().catch((error) => {
      console.warn("Failed to refresh sessions", error);
    });
    return true;
  } catch (error) {
    failSessionLoad(generation, error);
    throw error;
  }
}

async function newSession() {
  const generation = beginSessionLoad();
  try {
    const created = await createSession();
    if (generation !== sessionLoadGeneration) return;
    await loadSession(created.sessionId, generation);
  } catch (error) {
    failSessionLoad(generation, error);
  }
}

async function handleSend(message: string) {
  const trimmed = message.trim();
  const sessionId = state.sessionId;
  if (!trimmed || !sessionId || state.isStreaming || state.isLoadingSession) return;

  state.lastError = null;
  appendOptimisticUserMessage(trimmed);
  renderApp();

  try {
    await sendPrompt(sessionId, trimmed);
    await refreshSessions();
  } catch (error) {
    if (state.sessionId !== sessionId) return;
    state.lastError = error instanceof Error ? error.message : String(error);
    renderApp();
  }
}

async function handleRefreshSessions() {
  try {
    state.lastError = null;
    await refreshSessions();
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : String(error);
    renderApp();
  }
}

async function handleSelectSession(sessionId: string) {
  const target = state.sessions.find((session) => session.id === sessionId);
  if (
    state.isLoadingSession ||
    state.isStreaming ||
    target?.isStreaming ||
    sessionId === state.sessionId
  ) {
    return;
  }
  try {
    await loadSession(sessionId);
  } catch {
    // loadSession only reports failures for the latest selection.
  }
}

async function handleSelectModel(provider: string, id: string) {
  const sessionId = state.sessionId;
  if (!sessionId || state.isStreaming || state.isLoadingSession) return;
  try {
    state.lastError = null;
    const response = await setSessionModel(sessionId, provider, id);
    if (state.sessionId !== sessionId) return;
    if (state.metadata) state.metadata = { ...state.metadata, model: response.model };
    renderApp();
  } catch (error) {
    if (state.sessionId !== sessionId) return;
    state.lastError = error instanceof Error ? error.message : String(error);
    renderApp();
  }
}

async function handleAbort() {
  const sessionId = state.sessionId;
  if (!sessionId || state.isLoadingSession) return;
  try {
    await abortSession(sessionId);
    await refreshMetadata(sessionId);
  } catch (error) {
    if (state.sessionId !== sessionId) return;
    state.lastError = error instanceof Error ? error.message : String(error);
    renderApp();
  }
}

async function boot() {
  const app = document.getElementById("app");
  if (!app) throw new Error("#app not found");

  render(html`<pi-web-app class="contents"></pi-web-app>`, app);
  await customElements.whenDefined("pi-web-app");
  appElement = app.querySelector("pi-web-app") as PiWebApp;
  appElement.onSend = (message) => void handleSend(message);
  appElement.onAbort = () => void handleAbort();
  appElement.onNewSession = () => void newSession();
  appElement.onSelectSession = (sessionId) => void handleSelectSession(sessionId);
  appElement.onRefreshSessions = () => void handleRefreshSessions();
  appElement.onSelectModel = (provider, id) => void handleSelectModel(provider, id);
  void refreshModels().catch((error) => {
    state.lastError = error instanceof Error ? error.message : String(error);
    renderApp();
  });
  void refreshSessions().catch((error) => {
    state.lastError = error instanceof Error ? error.message : String(error);
    renderApp();
  });
  renderApp();

  const sessionId = getUrlSession();
  if (sessionId) {
    try {
      await loadSession(sessionId);
      return;
    } catch (error) {
      console.warn("Failed to load session from URL, creating a new one", error);
    }
  }
  await newSession();
}

boot().catch((error) => {
  state.lastError = error instanceof Error ? error.message : String(error);
  renderApp();
});
