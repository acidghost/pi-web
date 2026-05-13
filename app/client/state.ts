import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type {
  AssistantMessage,
  TextContent,
  ToolCall,
  ToolResultMessage,
  Usage,
} from "@earendil-works/pi-ai";
import type { BrowserEvent, ModelSummary, SessionMetadataResponse } from "@shared/protocol";

export interface AppState {
  sessionId: string | null;
  metadata: SessionMetadataResponse | null;
  models: ModelSummary[];
  messages: AgentMessage[];
  isStreaming: boolean;
  pendingToolCalls: Set<string>;
  currentAssistantMessageId: string | null;
  currentAssistantMessage: AssistantMessage | null;
  lastError: string | null;
  transcriptRevision: number;
}

export const state: AppState = {
  sessionId: null,
  metadata: null,
  models: [],
  messages: [],
  isStreaming: false,
  pendingToolCalls: new Set<string>(),
  currentAssistantMessageId: null,
  currentAssistantMessage: null,
  lastError: null,
  transcriptRevision: 0,
};

function bumpTranscriptRevision() {
  state.transcriptRevision += 1;
}

const emptyUsage = (): Usage => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
});

function createAssistantMessage(timestamp = Date.now()): AssistantMessage {
  const model = state.metadata?.model;
  return {
    role: "assistant",
    content: [],
    api: "openai-responses",
    provider: model?.provider || "unknown",
    model: model?.id || "unknown",
    usage: emptyUsage(),
    stopReason: "stop",
    timestamp,
  };
}

function getOrCreateCurrentAssistant(timestamp?: number): AssistantMessage {
  if (state.currentAssistantMessage) return state.currentAssistantMessage;
  const message = createAssistantMessage(timestamp);
  state.currentAssistantMessage = message;
  state.currentAssistantMessageId = `synthetic-${timestamp ?? Date.now()}`;
  state.messages = [...state.messages, message];
  return message;
}

function getTextBlock(message: AssistantMessage): TextContent {
  const last = message.content[message.content.length - 1];
  if (last?.type === "text") return last;
  const block: TextContent = { type: "text", text: "" };
  message.content.push(block);
  return block;
}

function replaceCurrentAssistantWithFinal(event: Extract<BrowserEvent, { type: "message_end" }>) {
  const current = state.currentAssistantMessage;
  if (!current) return;

  if (event.text !== undefined) {
    const nonText = current.content.filter((block) => block.type !== "text");
    current.content = event.text ? [{ type: "text", text: event.text }, ...nonText] : nonText;
  }
  if (event.stopReason) current.stopReason = event.stopReason as AssistantMessage["stopReason"];
  if (event.timestamp) current.timestamp = event.timestamp;

  state.currentAssistantMessage = null;
  state.currentAssistantMessageId = null;
}

function findLastAssistantMessage(): AssistantMessage | undefined {
  for (let index = state.messages.length - 1; index >= 0; index--) {
    const message = state.messages[index];
    if (message?.role === "assistant") return message;
  }
}

function appendToolCall(event: Extract<BrowserEvent, { type: "tool_start" }>) {
  const assistant =
    state.currentAssistantMessage ?? findLastAssistantMessage() ?? getOrCreateCurrentAssistant();
  const exists = assistant.content.some(
    (block) => block.type === "toolCall" && block.id === event.toolCallId,
  );
  if (!exists) {
    const toolCall: ToolCall = {
      type: "toolCall",
      id: event.toolCallId,
      name: event.toolName,
      arguments: typeof event.args === "object" && event.args !== null ? event.args : {},
    };
    assistant.content.push(toolCall);
  }
  state.pendingToolCalls.add(event.toolCallId);
}

function upsertToolResult(result: ToolResultMessage) {
  const existingIndex = state.messages.findIndex(
    (message) => message.role === "toolResult" && message.toolCallId === result.toolCallId,
  );
  if (existingIndex >= 0) {
    const next = [...state.messages];
    next[existingIndex] = result;
    state.messages = next;
  } else {
    state.messages = [...state.messages, result];
  }
  bumpTranscriptRevision();
}

function appendToolUpdate(event: Extract<BrowserEvent, { type: "tool_update" }>) {
  if (!event.text) return;
  const existing = state.messages.find(
    (message): message is ToolResultMessage =>
      message.role === "toolResult" && message.toolCallId === event.toolCallId,
  );
  const previousText =
    existing?.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("") ?? "";
  upsertToolResult({
    role: "toolResult",
    toolCallId: event.toolCallId,
    toolName: event.toolName,
    content: [{ type: "text", text: previousText + event.text }],
    details: event.raw,
    isError: false,
    timestamp: existing?.timestamp ?? Date.now(),
  });
}

function appendToolResult(event: Extract<BrowserEvent, { type: "tool_end" }>) {
  const result: ToolResultMessage = {
    role: "toolResult",
    toolCallId: event.toolCallId,
    toolName: event.toolName,
    content: event.text ? [{ type: "text", text: event.text }] : [],
    details: event.raw,
    isError: event.isError,
    timestamp: Date.now(),
  };
  state.pendingToolCalls.delete(event.toolCallId);
  upsertToolResult(result);
}

export function setMessages(messages: AgentMessage[]) {
  state.messages = [...messages];
  state.pendingToolCalls.clear();
  state.currentAssistantMessage = null;
  state.currentAssistantMessageId = null;
  bumpTranscriptRevision();
}

export function appendOptimisticUserMessage(text: string) {
  state.messages = [...state.messages, { role: "user", content: text, timestamp: Date.now() }];
  bumpTranscriptRevision();
}

export function applyBrowserEvent(event: BrowserEvent) {
  switch (event.type) {
    case "session_state":
      state.isStreaming = event.isStreaming;
      if (state.metadata)
        state.metadata = {
          ...state.metadata,
          isStreaming: event.isStreaming,
          updatedAt: event.updatedAt,
          model: event.model,
          thinkingLevel: event.thinkingLevel,
        };
      break;

    case "message_start": {
      const message = createAssistantMessage(event.timestamp);
      state.currentAssistantMessageId = event.messageId;
      state.currentAssistantMessage = message;
      state.messages = [...state.messages, message];
      bumpTranscriptRevision();
      break;
    }

    case "message_delta": {
      if (event.messageId !== state.currentAssistantMessageId) return;
      const assistant = getOrCreateCurrentAssistant();
      getTextBlock(assistant).text += event.text;
      state.messages = [...state.messages];
      bumpTranscriptRevision();
      break;
    }

    case "message_end":
      replaceCurrentAssistantWithFinal(event);
      state.messages = state.messages.filter((message) => {
        if (message.role !== "assistant") return true;
        return message.content.some((block) => block.type !== "text" || block.text.trim());
      });
      bumpTranscriptRevision();
      break;

    case "tool_start":
      appendToolCall(event);
      state.messages = [...state.messages];
      bumpTranscriptRevision();
      break;

    case "tool_update":
      appendToolUpdate(event);
      break;

    case "tool_end":
      appendToolResult(event);
      break;

    case "agent_end":
      state.isStreaming = false;
      if (state.metadata)
        state.metadata = { ...state.metadata, isStreaming: false, updatedAt: event.updatedAt };
      break;

    case "error":
      state.lastError = event.message;
      break;
  }
}
