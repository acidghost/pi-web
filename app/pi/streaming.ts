import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { contentText } from "@shared/message-content";
import type { BrowserEvent, UiMessage } from "@shared/protocol";
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
    model: webSession.session.model
      ? {
          provider: webSession.session.model.provider,
          id: webSession.session.model.id,
          name: webSession.session.model.name || webSession.session.model.id,
        }
      : null,
    thinkingLevel: webSession.session.thinkingLevel,
  };
}

export function broadcast(webSession: WebSession, event: BrowserEvent): void {
  for (const subscriber of webSession.subscribers) {
    subscriber.send(event);
  }
}

type ToolResultLike = {
  content?: Message["content"];
  details?: unknown;
};

function toolResultText(result?: ToolResultLike): string | undefined {
  if (!result) return undefined;
  const text = result.content ? contentText(result.content) : "";
  if (text) return text;
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

export function mapAgentEvent(webSession: WebSession, event: AgentSessionEvent): BrowserEvent[] {
  webSession.updatedAt = Date.now();

  switch (event.type) {
    case "agent_start":
      return [sessionStateEvent(webSession)];

    case "message_start": {
      if (event.message.role === "assistant") {
        const messageId = `assistant-${event.message.timestamp}-${crypto.randomUUID()}`;
        webSession.currentAssistantMessageId = messageId;
        return [
          {
            type: "message_start",
            messageId,
            role: "assistant",
            timestamp: event.message.timestamp,
          },
        ];
      }
      return [];
    }

    case "message_update": {
      if (
        event.message.role === "assistant" &&
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
      if (event.message.role === "assistant" && webSession.currentAssistantMessageId) {
        const messageId = webSession.currentAssistantMessageId;
        webSession.currentAssistantMessageId = undefined;
        const events: BrowserEvent[] = [
          {
            type: "message_end",
            messageId,
            text: contentText(event.message.content),
            stopReason: event.message.stopReason,
            timestamp: event.message.timestamp,
          },
        ];
        if (event.message.errorMessage) {
          webSession.lastError = event.message.errorMessage;
          events.push({ type: "error", message: event.message.errorMessage });
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

  messages.forEach((msg, index) => {
    const timestamp = msg.timestamp;

    if (msg.role === "user") {
      const text = contentText(msg.content);
      if (text) normalized.push({ id: `history-${index}`, role: "user", text, timestamp });
      return;
    }

    if (msg.role === "assistant") {
      const text = contentText(msg.content, {
        includeImages: false,
        includeThinking: false,
        includeToolCalls: false,
      });
      if (text) normalized.push({ id: `history-${index}`, role: "assistant", text, timestamp });
      if (msg.errorMessage) {
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
        contentText(msg.content) || (msg.details !== undefined ? safeJson(msg.details) : "");
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
