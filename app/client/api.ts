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
import {
  AbortResponseSchema,
  ApiErrorResponseSchema,
  CreateSessionResponseSchema,
  formatZodError,
  MessagesResponseSchema,
  ModelsResponseSchema,
  PromptResponseSchema,
  SessionMetadataResponseSchema,
  SetModelResponseSchema,
} from "@shared/protocol";
import type { z } from "zod";

async function fetchJson<T>(schema: z.ZodType<T>, url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = ApiErrorResponseSchema.safeParse(data);
    const message = error.success
      ? error.data.error.message
      : `${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`Invalid response from server: ${formatZodError(parsed.error)}`);
  }
  return parsed.data;
}

export function createSession(): Promise<CreateSessionResponse> {
  return fetchJson(CreateSessionResponseSchema, "/api/sessions", { method: "POST" });
}

export function getSession(sessionId: string): Promise<SessionMetadataResponse> {
  return fetchJson(SessionMetadataResponseSchema, `/api/sessions/${encodeURIComponent(sessionId)}`);
}

export function getMessages(sessionId: string): Promise<MessagesResponse> {
  return fetchJson(
    MessagesResponseSchema,
    `/api/sessions/${encodeURIComponent(sessionId)}/messages`,
  );
}

export function getModels(): Promise<ModelsResponse> {
  return fetchJson(ModelsResponseSchema, "/api/models");
}

export function setSessionModel(
  sessionId: string,
  provider: string,
  id: string,
): Promise<SetModelResponse> {
  const body: SetModelRequest = { provider, id };
  return fetchJson(SetModelResponseSchema, `/api/sessions/${encodeURIComponent(sessionId)}/model`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function sendPrompt(sessionId: string, message: string): Promise<PromptResponse> {
  const body: PromptRequest = { message };
  return fetchJson(PromptResponseSchema, `/api/sessions/${encodeURIComponent(sessionId)}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function abortSession(sessionId: string): Promise<AbortResponse> {
  return fetchJson(AbortResponseSchema, `/api/sessions/${encodeURIComponent(sessionId)}/abort`, {
    method: "POST",
  });
}
