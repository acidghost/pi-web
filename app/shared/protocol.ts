import type { AgentMessage } from "@earendil-works/pi-agent-core";

export type BrowserEvent =
  | { type: "session_state"; sessionId: string; isStreaming: boolean; updatedAt: number }
  | { type: "message_start"; messageId: string; role: "assistant"; timestamp?: number }
  | { type: "message_delta"; messageId: string; text: string }
  | {
      type: "message_end";
      messageId: string;
      text?: string;
      stopReason?: string;
      timestamp?: number;
    }
  | { type: "tool_start"; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool_update"; toolCallId: string; toolName: string; text?: string; raw?: unknown }
  | {
      type: "tool_end";
      toolCallId: string;
      toolName: string;
      text?: string;
      raw?: unknown;
      isError: boolean;
    }
  | { type: "agent_end"; sessionId: string; updatedAt: number }
  | { type: "error"; message: string };

export interface UiMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  text: string;
  toolName?: string;
  isError?: boolean;
  timestamp?: number;
}

export interface ModelSummary {
  provider: string;
  id: string;
  name: string;
}

export interface SessionMetadataResponse {
  id: string;
  cwd: string;
  createdAt: number;
  updatedAt: number;
  isStreaming: boolean;
  thinkingLevel: string;
  model: ModelSummary | null;
}

export interface CreateSessionResponse {
  sessionId: string;
}

export interface MessagesResponse {
  messages: UiMessage[];
  agentMessages: AgentMessage[];
}

export interface PromptRequest {
  message: string;
}

export interface PromptResponse {
  accepted: true;
}

export interface AbortResponse {
  ok: true;
}

export interface ApiErrorResponse {
  error: { message: string };
}

export interface HealthResponse {
  ok: true;
}
