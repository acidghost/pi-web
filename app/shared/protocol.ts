import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { z } from "zod";

const UnknownRecordSchema = z.record(z.string(), z.unknown());

export const ThinkingLevelSchema = z.enum(["off", "minimal", "low", "medium", "high", "xhigh"]);
export const StopReasonSchema = z.enum(["stop", "length", "toolUse", "error", "aborted"]);

export const TextContentSchema = z
  .object({
    type: z.literal("text"),
    text: z.string(),
    textSignature: z.string().optional(),
  })
  .strict();

export const ThinkingContentSchema = z
  .object({
    type: z.literal("thinking"),
    thinking: z.string(),
    thinkingSignature: z.string().optional(),
    redacted: z.boolean().optional(),
  })
  .strict();

export const ImageContentSchema = z
  .object({
    type: z.literal("image"),
    data: z.string(),
    mimeType: z.string(),
  })
  .strict();

export const ToolCallSchema = z
  .object({
    type: z.literal("toolCall"),
    id: z.string(),
    name: z.string(),
    arguments: UnknownRecordSchema,
    thoughtSignature: z.string().optional(),
  })
  .strict();

export const UsageSchema = z
  .object({
    input: z.number(),
    output: z.number(),
    cacheRead: z.number(),
    cacheWrite: z.number(),
    totalTokens: z.number(),
    cost: z
      .object({
        input: z.number(),
        output: z.number(),
        cacheRead: z.number(),
        cacheWrite: z.number(),
        total: z.number(),
      })
      .strict(),
  })
  .strict();

export const AssistantMessageDiagnosticSchema = z
  .object({
    type: z.string(),
    timestamp: z.number(),
    error: z
      .object({
        name: z.string().optional(),
        message: z.string(),
        stack: z.string().optional(),
        code: z.union([z.string(), z.number()]).optional(),
      })
      .strict()
      .optional(),
    details: UnknownRecordSchema.optional(),
  })
  .strict();

export const UserMessageSchema = z
  .object({
    role: z.literal("user"),
    content: z.union([
      z.string(),
      z.array(z.discriminatedUnion("type", [TextContentSchema, ImageContentSchema])),
    ]),
    timestamp: z.number(),
  })
  .strict();

export const AssistantMessageSchema = z
  .object({
    role: z.literal("assistant"),
    content: z.array(
      z.discriminatedUnion("type", [TextContentSchema, ThinkingContentSchema, ToolCallSchema]),
    ),
    api: z.string(),
    provider: z.string(),
    model: z.string(),
    responseModel: z.string().optional(),
    responseId: z.string().optional(),
    diagnostics: z.array(AssistantMessageDiagnosticSchema).optional(),
    usage: UsageSchema,
    stopReason: StopReasonSchema,
    errorMessage: z.string().optional(),
    timestamp: z.number(),
  })
  .strict();

export const ToolResultMessageSchema = z
  .object({
    role: z.literal("toolResult"),
    toolCallId: z.string(),
    toolName: z.string(),
    content: z.array(z.discriminatedUnion("type", [TextContentSchema, ImageContentSchema])),
    details: z.unknown().optional(),
    isError: z.boolean(),
    timestamp: z.number(),
  })
  .strict();

export const BashExecutionMessageSchema = z
  .object({
    role: z.literal("bashExecution"),
    command: z.string(),
    output: z.string(),
    exitCode: z.number().optional(),
    cancelled: z.boolean(),
    truncated: z.boolean(),
    fullOutputPath: z.string().optional(),
    timestamp: z.number(),
    excludeFromContext: z.boolean().optional(),
  })
  .strict()
  .transform((message) => ({ ...message, exitCode: message.exitCode }));

export const CustomMessageSchema = z
  .object({
    role: z.literal("custom"),
    customType: z.string(),
    content: z.union([
      z.string(),
      z.array(z.discriminatedUnion("type", [TextContentSchema, ImageContentSchema])),
    ]),
    display: z.boolean(),
    details: z.unknown().optional(),
    timestamp: z.number(),
  })
  .strict();

export const BranchSummaryMessageSchema = z
  .object({
    role: z.literal("branchSummary"),
    summary: z.string(),
    fromId: z.string(),
    timestamp: z.number(),
  })
  .strict();

export const CompactionSummaryMessageSchema = z
  .object({
    role: z.literal("compactionSummary"),
    summary: z.string(),
    tokensBefore: z.number(),
    timestamp: z.number(),
  })
  .strict();

export const AgentMessageSchema: z.ZodType<AgentMessage> = z.union([
  UserMessageSchema,
  AssistantMessageSchema,
  ToolResultMessageSchema,
  BashExecutionMessageSchema,
  CustomMessageSchema,
  BranchSummaryMessageSchema,
  CompactionSummaryMessageSchema,
]);

export const ModelSummarySchema = z
  .object({
    provider: z.string(),
    id: z.string(),
    name: z.string(),
  })
  .strict();

export const UiMessageSchema = z
  .object({
    id: z.string(),
    role: z.enum(["user", "assistant", "tool", "system"]),
    text: z.string(),
    toolName: z.string().optional(),
    isError: z.boolean().optional(),
    timestamp: z.number().optional(),
  })
  .strict();

export const BrowserEventSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("session_state"),
      sessionId: z.string(),
      isStreaming: z.boolean(),
      updatedAt: z.number(),
      model: ModelSummarySchema.nullable(),
      thinkingLevel: ThinkingLevelSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("message_start"),
      messageId: z.string(),
      role: z.literal("assistant"),
      timestamp: z.number().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("message_delta"),
      messageId: z.string(),
      text: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("message_end"),
      messageId: z.string(),
      text: z.string().optional(),
      stopReason: StopReasonSchema.optional(),
      timestamp: z.number().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("tool_start"),
      toolCallId: z.string(),
      toolName: z.string(),
      args: z.unknown(),
    })
    .strict(),
  z
    .object({
      type: z.literal("tool_update"),
      toolCallId: z.string(),
      toolName: z.string(),
      text: z.string().optional(),
      raw: z.unknown().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("tool_end"),
      toolCallId: z.string(),
      toolName: z.string(),
      text: z.string().optional(),
      raw: z.unknown().optional(),
      isError: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("agent_end"),
      sessionId: z.string(),
      updatedAt: z.number(),
    })
    .strict(),
  z
    .object({
      type: z.literal("error"),
      message: z.string(),
    })
    .strict(),
]);

export const SessionMetadataResponseSchema = z
  .object({
    id: z.string(),
    cwd: z.string(),
    createdAt: z.number(),
    updatedAt: z.number(),
    isStreaming: z.boolean(),
    thinkingLevel: ThinkingLevelSchema,
    model: ModelSummarySchema.nullable(),
  })
  .strict();

export const CreateSessionResponseSchema = z
  .object({
    sessionId: z.string(),
  })
  .strict();

export const MessagesResponseSchema = z
  .object({
    messages: z.array(UiMessageSchema),
    agentMessages: z.array(AgentMessageSchema),
  })
  .strict();

export const PromptRequestSchema = z
  .object({
    message: z.string().trim().min(1, "Message must be a non-empty string"),
  })
  .strict();

export const PromptResponseSchema = z
  .object({
    accepted: z.literal(true),
  })
  .strict();

export const SetModelRequestSchema = z
  .object({
    provider: z.string().trim().min(1, "Model provider is required"),
    id: z.string().trim().min(1, "Model id is required"),
  })
  .strict();

export const SetModelResponseSchema = z
  .object({
    ok: z.literal(true),
    model: ModelSummarySchema.nullable(),
  })
  .strict();

export const ModelDetailsSchema = ModelSummarySchema.extend({
  api: z.string(),
  reasoning: z.boolean(),
}).strict();

export const ModelsResponseSchema = z
  .object({
    models: z.array(ModelDetailsSchema),
  })
  .strict();

export const AbortResponseSchema = z
  .object({
    ok: z.literal(true),
  })
  .strict();

export const ApiErrorResponseSchema = z
  .object({
    error: z
      .object({
        message: z.string(),
      })
      .strict(),
  })
  .strict();

export const HealthResponseSchema = z
  .object({
    ok: z.literal(true),
  })
  .strict();

export type BrowserEvent = z.infer<typeof BrowserEventSchema>;
export type UiMessage = z.infer<typeof UiMessageSchema>;
export type ModelSummary = z.infer<typeof ModelSummarySchema>;
export type SessionMetadataResponse = z.infer<typeof SessionMetadataResponseSchema>;
export type CreateSessionResponse = z.infer<typeof CreateSessionResponseSchema>;
export type MessagesResponse = z.infer<typeof MessagesResponseSchema>;
export type PromptRequest = z.infer<typeof PromptRequestSchema>;
export type PromptResponse = z.infer<typeof PromptResponseSchema>;
export type SetModelRequest = z.infer<typeof SetModelRequestSchema>;
export type SetModelResponse = z.infer<typeof SetModelResponseSchema>;
export type ModelsResponse = z.infer<typeof ModelsResponseSchema>;
export type AbortResponse = z.infer<typeof AbortResponseSchema>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "body";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}
