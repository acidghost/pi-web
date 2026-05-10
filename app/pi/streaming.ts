import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { BrowserEvent, UiMessage } from "../shared/protocol.ts";
import type { WebSession } from "./types.ts";

export function sseData(event: BrowserEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function sessionStateEvent(webSession: WebSession): BrowserEvent {
  return {
    type: "session_state",
    sessionId: webSession.id,
    isStreaming: webSession.session.isStreaming,
    updatedAt: webSession.updatedAt,
  };
}

export function broadcast(webSession: WebSession, event: BrowserEvent): void {
  for (const subscriber of webSession.subscribers) {
    subscriber.send(event);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function textFromContent(content: unknown, includeImages = true): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((block) => {
      if (!isRecord(block)) return "";
      if (block.type === "text" && typeof block.text === "string") return block.text;
      if (includeImages && block.type === "image") return "[image]";
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function toolResultText(result: unknown): string | undefined {
  if (!isRecord(result)) return undefined;
  const contentText = textFromContent(result.content, true).trim();
  if (contentText) return contentText;
  if (result.details !== undefined) return safeJson(result.details);
  return undefined;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function assistantText(message: AgentMessage): string {
  const msg = message as unknown;
  if (!isRecord(msg) || msg.role !== "assistant") return "";
  return textFromContent(msg.content, false);
}

function messageTimestamp(message: AgentMessage): number | undefined {
  const msg = message as unknown;
  if (!isRecord(msg) || typeof msg.timestamp !== "number") return undefined;
  return msg.timestamp;
}

export function mapAgentEvent(webSession: WebSession, event: AgentSessionEvent): BrowserEvent[] {
  webSession.updatedAt = Date.now();

  switch (event.type) {
    case "agent_start":
      return [sessionStateEvent(webSession)];

    case "message_start": {
      const msg = event.message as unknown;
      if (isRecord(msg) && msg.role === "assistant") {
        const messageId = `assistant-${messageTimestamp(event.message) ?? Date.now()}-${crypto.randomUUID()}`;
        webSession.currentAssistantMessageId = messageId;
        return [
          {
            type: "message_start",
            messageId,
            role: "assistant",
            timestamp: messageTimestamp(event.message),
          },
        ];
      }
      return [];
    }

    case "message_update": {
      const msg = event.message as unknown;
      if (
        isRecord(msg) &&
        msg.role === "assistant" &&
        event.assistantMessageEvent.type === "text_delta" &&
        webSession.currentAssistantMessageId
      ) {
        return [
          {
            type: "message_delta",
            messageId: webSession.currentAssistantMessageId,
            text: event.assistantMessageEvent.delta,
          },
        ];
      }
      if (event.assistantMessageEvent.type === "error") {
        const message = event.assistantMessageEvent.error.errorMessage || "Assistant failed";
        webSession.lastError = message;
        return [{ type: "error", message }];
      }
      return [];
    }

    case "message_end": {
      const msg = event.message as unknown;
      if (isRecord(msg) && msg.role === "assistant" && webSession.currentAssistantMessageId) {
        const messageId = webSession.currentAssistantMessageId;
        webSession.currentAssistantMessageId = undefined;
        const events: BrowserEvent[] = [
          {
            type: "message_end",
            messageId,
            text: assistantText(event.message),
            stopReason: typeof msg.stopReason === "string" ? msg.stopReason : undefined,
            timestamp: messageTimestamp(event.message),
          },
        ];
        if (typeof msg.errorMessage === "string" && msg.errorMessage) {
          webSession.lastError = msg.errorMessage;
          events.push({ type: "error", message: msg.errorMessage });
        }
        return events;
      }
      return [];
    }

    case "tool_execution_start":
      return [
        {
          type: "tool_start",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
        },
      ];

    case "tool_execution_update": {
      const text = toolResultText(event.partialResult);
      return [
        {
          type: "tool_update",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          text,
          raw: event.partialResult,
        },
      ];
    }

    case "tool_execution_end": {
      const text = toolResultText(event.result);
      return [
        {
          type: "tool_end",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          text,
          raw: event.result,
          isError: event.isError,
        },
      ];
    }

    case "agent_end":
      return [
        sessionStateEvent(webSession),
        { type: "agent_end", sessionId: webSession.id, updatedAt: webSession.updatedAt },
      ];

    case "compaction_end":
      if (event.errorMessage) {
        webSession.lastError = event.errorMessage;
        return [{ type: "error", message: event.errorMessage }];
      }
      return [];

    case "auto_retry_start":
      return [{ type: "error", message: `Retrying after error: ${event.errorMessage}` }];

    case "auto_retry_end":
      if (!event.success && event.finalError) {
        webSession.lastError = event.finalError;
        return [{ type: "error", message: event.finalError }];
      }
      return [];

    default:
      return [];
  }
}

export function normalizeMessages(messages: AgentMessage[]): UiMessage[] {
  const normalized: UiMessage[] = [];

  messages.forEach((message, index) => {
    const msg = message as unknown;
    if (!isRecord(msg) || typeof msg.role !== "string") return;
    const timestamp = typeof msg.timestamp === "number" ? msg.timestamp : undefined;

    if (msg.role === "user") {
      const text = textFromContent(msg.content, true).trim();
      if (text) normalized.push({ id: `history-${index}`, role: "user", text, timestamp });
      return;
    }

    if (msg.role === "assistant") {
      const text = textFromContent(msg.content, false).trim();
      if (text) normalized.push({ id: `history-${index}`, role: "assistant", text, timestamp });
      if (typeof msg.errorMessage === "string" && msg.errorMessage) {
        normalized.push({
          id: `history-${index}-error`,
          role: "system",
          text: msg.errorMessage,
          isError: true,
          timestamp,
        });
      }
      return;
    }

    if (msg.role === "toolResult") {
      const text =
        textFromContent(msg.content, true).trim() ||
        (msg.details !== undefined ? safeJson(msg.details) : "");
      if (text) {
        normalized.push({
          id: typeof msg.toolCallId === "string" ? `tool-${msg.toolCallId}` : `history-${index}`,
          role: "tool",
          text,
          toolName: typeof msg.toolName === "string" ? msg.toolName : undefined,
          isError: msg.isError === true,
          timestamp,
        });
      }
    }
  });

  return normalized;
}
