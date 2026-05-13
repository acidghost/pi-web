import type {
  AbortResponse,
  CreateSessionResponse,
  MessagesResponse,
  ModelsResponse,
  PromptRequest,
  PromptResponse,
  SessionMetadataResponse,
  SetModelRequest,
  SetModelResponse,
} from "@shared/protocol";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error?.message ?? `${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  return data as T;
}

export function createSession(): Promise<CreateSessionResponse> {
  return fetchJson<CreateSessionResponse>("/api/sessions", { method: "POST" });
}

export function getSession(sessionId: string): Promise<SessionMetadataResponse> {
  return fetchJson<SessionMetadataResponse>(`/api/sessions/${encodeURIComponent(sessionId)}`);
}

export function getMessages(sessionId: string): Promise<MessagesResponse> {
  return fetchJson<MessagesResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/messages`);
}

export function getModels(): Promise<ModelsResponse> {
  return fetchJson<ModelsResponse>("/api/models");
}

export function setSessionModel(
  sessionId: string,
  provider: string,
  id: string,
): Promise<SetModelResponse> {
  const body: SetModelRequest = { provider, id };
  return fetchJson<SetModelResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/model`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function sendPrompt(sessionId: string, message: string): Promise<PromptResponse> {
  const body: PromptRequest = { message };
  return fetchJson<PromptResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function abortSession(sessionId: string): Promise<AbortResponse> {
  return fetchJson<AbortResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/abort`, {
    method: "POST",
  });
}
