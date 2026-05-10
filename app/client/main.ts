import type { BrowserEvent } from "@shared/protocol";
import { html, render } from "lit";
import "./app";
import { abortSession, createSession, getMessages, getSession, sendPrompt } from "./api";
import type { PiWebApp } from "./app";
import { appendOptimisticUserMessage, applyBrowserEvent, setMessages, state } from "./state";

let eventSource: EventSource | undefined;
let appElement: PiWebApp;

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
  eventSource = new EventSource(`/api/sessions/${encodeURIComponent(sessionId)}/events`);

  eventSource.onopen = () => {
    state.lastError = null;
    void refreshMetadata();
  };

  eventSource.onmessage = (message) => {
    try {
      const event = JSON.parse(message.data) as BrowserEvent;
      applyBrowserEvent(event);
      renderApp();
    } catch (error) {
      state.lastError = error instanceof Error ? error.message : String(error);
      renderApp();
    }
  };

  eventSource.onerror = () => {
    state.lastError = "SSE disconnected; reconnecting…";
    renderApp();
  };
}

async function refreshMetadata() {
  if (!state.sessionId) return;
  state.metadata = await getSession(state.sessionId);
  state.isStreaming = state.metadata.isStreaming;
  renderApp();
}

async function loadSession(sessionId: string) {
  state.sessionId = sessionId;
  state.lastError = null;
  state.metadata = await getSession(sessionId);
  state.isStreaming = state.metadata.isStreaming;
  const history = await getMessages(sessionId);
  setMessages(history.agentMessages || []);
  openEvents(sessionId);
  renderApp();
}

async function newSession() {
  eventSource?.close();
  state.messages = [];
  state.pendingToolCalls.clear();
  state.currentAssistantMessage = null;
  state.currentAssistantMessageId = null;
  state.lastError = null;
  renderApp();

  const created = await createSession();
  setUrlSession(created.sessionId);
  await loadSession(created.sessionId);
}

async function handleSend(message: string) {
  const trimmed = message.trim();
  if (!trimmed || !state.sessionId || state.isStreaming) return;

  state.lastError = null;
  appendOptimisticUserMessage(trimmed);
  renderApp();

  try {
    await sendPrompt(state.sessionId, trimmed);
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : String(error);
    renderApp();
  }
}

async function handleAbort() {
  if (!state.sessionId) return;
  try {
    await abortSession(state.sessionId);
    await refreshMetadata();
  } catch (error) {
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
