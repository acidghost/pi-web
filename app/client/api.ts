import type {
  AbortResponse,
  CreateSessionResponse,
  MessagesResponse,
  PromptRequest,
  PromptResponse,
  SessionMetadataResponse,
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
