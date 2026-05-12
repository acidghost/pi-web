import type { Message } from "@earendil-works/pi-ai";

export interface ContentTextOptions {
  includeImages?: boolean;
  includeThinking?: boolean;
  includeToolCalls?: boolean;
}

export function contentText(content: Message["content"], options: ContentTextOptions = {}): string {
  const { includeImages = true, includeThinking = true, includeToolCalls = true } = options;

  if (typeof content === "string") return content;

  return content
    .map((block) => {
      switch (block.type) {
        case "image":
          return includeImages ? "[image]" : "";
        case "text":
          return block.text;
        case "thinking":
          return includeThinking && block.thinking ? `Thinking:\n${block.thinking}` : "";
        case "toolCall":
          return includeToolCalls ? `Tool call:\n${block.name}` : "";
        default:
          throw new Error(`Unhandled content type: ${block satisfies never}`);
      }
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}
