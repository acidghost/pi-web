import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, ToolResultMessage } from "@earendil-works/pi-ai";

export function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (typeof block !== "object" || block === null) return "";
      if (
        "type" in block &&
        block.type === "text" &&
        "text" in block &&
        typeof block.text === "string"
      )
        return block.text;
      if (
        "type" in block &&
        block.type === "thinking" &&
        "thinking" in block &&
        typeof block.thinking === "string"
      ) {
        return block.thinking ? `Thinking:\n${block.thinking}` : "";
      }
      if ("type" in block && block.type === "image") return "[image]";
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

export function assistantToolCalls(message: AssistantMessage) {
  return message.content.filter((block) => block.type === "toolCall");
}

export function toolResultById(messages: AgentMessage[]) {
  const results = new Map<string, ToolResultMessage>();
  for (const message of messages) {
    if (message.role === "toolResult")
      results.set(message.toolCallId, message as ToolResultMessage);
  }
  return results;
}
