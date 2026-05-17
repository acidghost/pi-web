import type { BunRequest } from "bun";
import type { z } from "zod";
import homepage from "./index.html";
import { loadConfig } from "./pi/config.ts";
import {
  addSubscriber,
  createServices,
  createWebSession,
  disposeAllSessions,
  getOrOpenWebSession,
  listWebSessions,
  modelToJson,
  notifyError,
  notifyState,
  removeSubscriber,
  sessionMetadata,
} from "./pi/session-manager.ts";
import { normalizeMessages, sseData } from "./pi/streaming.ts";
import type { SseSubscriber, WebSession } from "./pi/types.ts";
import {
  AbortResponseSchema,
  ApiErrorResponseSchema,
  CreateSessionResponseSchema,
  formatZodError,
  HealthResponseSchema,
  ListSessionsResponseSchema,
  MessagesResponseSchema,
  ModelsResponseSchema,
  PromptRequestSchema,
  PromptResponseSchema,
  SessionMetadataResponseSchema,
  SetModelRequestSchema,
  SetModelResponseSchema,
} from "./shared/protocol.ts";

const config = loadConfig();
const services = createServices(config);

const isDevelopment = process.env.NODE_ENV !== "production";

function json<T>(schema: z.ZodType<T>, data: T, status: number = 200): Response {
  return new Response(JSON.stringify(schema.parse(data)), {
    status,
    headers: { ...commonResponseHeaders },
  });
}

function jsonError(message: string, status = 500): Response {
  return json(ApiErrorResponseSchema, { error: { message } }, status);
}

function notFound(): Response {
  return jsonError("Not found", 404);
}

const commonResponseHeaders: Record<string, string> = {
  "content-type": "application/json; charset=utf-8",
};

async function parseJsonBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw jsonError("Expected application/json", 415);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw jsonError("Invalid JSON body", 400);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) throw jsonError(formatZodError(parsed.error), 400);
  return parsed.data;
}

async function handleCreateSession(): Promise<Response> {
  const webSession = await createWebSession(config, services);
  return json(CreateSessionResponseSchema, { sessionId: webSession.id }, 201);
}

async function handleListSessions(): Promise<Response> {
  return json(ListSessionsResponseSchema, { sessions: await listWebSessions(config) });
}

async function handleWithSession(
  request: BunRequest,
  handler: (session: WebSession, request: BunRequest) => Promise<Response>,
): Promise<Response> {
  const id = request.params.id;
  if (!id) return notFound();
  const webSession = await getOrOpenWebSession(config, services, id);
  if (!webSession) return notFound();
  return await handler(webSession, request);
}

async function handleGetSession(webSession: WebSession): Promise<Response> {
  return json(SessionMetadataResponseSchema, sessionMetadata(config, webSession));
}

async function handleGetMessages(webSession: WebSession): Promise<Response> {
  return json(MessagesResponseSchema, {
    messages: normalizeMessages(webSession.session.messages),
    agentMessages: webSession.session.messages,
  });
}

async function handlePrompt(webSession: WebSession, request: Request): Promise<Response> {
  const { message } = await parseJsonBody(request, PromptRequestSchema);

  if (webSession.session.isStreaming) {
    return jsonError("Session is already streaming", 409);
  }

  let acceptedSettled = false;
  let promptError: string | undefined;
  let resolveAccepted!: (accepted: boolean) => void;
  const acceptedPromise = new Promise<boolean>((resolve) => {
    resolveAccepted = resolve;
  });

  const settleAccepted = (accepted: boolean) => {
    if (!acceptedSettled) {
      acceptedSettled = true;
      resolveAccepted(accepted);
    }
  };

  try {
    const run = webSession.session.prompt(message, {
      preflightResult: (success) => settleAccepted(success),
    });

    run.catch((error) => {
      promptError = error instanceof Error ? error.message : String(error);
      notifyError(webSession, promptError);
      settleAccepted(false);
    });
  } catch (error) {
    promptError = error instanceof Error ? error.message : String(error);
    notifyError(webSession, promptError);
    return jsonError(promptError, 400);
  }

  const accepted = await acceptedPromise;
  if (!accepted) return jsonError(promptError || webSession.lastError || "Prompt rejected", 400);
  notifyState(webSession);
  return json(PromptResponseSchema, { accepted: true }, 202);
}

async function handleAbort(webSession: WebSession): Promise<Response> {
  await webSession.session.abort();
  notifyState(webSession);
  return json(AbortResponseSchema, { ok: true });
}

async function handleEvents(webSession: WebSession, request: Request): Promise<Response> {
  const encoder = new TextEncoder();
  let keepAlive: Timer | undefined;
  let closed = false;
  let subscriber: SseSubscriber;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enqueue = (chunk: string) => {
        if (!closed) controller.enqueue(encoder.encode(chunk));
      };

      subscriber = {
        id: crypto.randomUUID(),
        send: (event) => enqueue(sseData(event)),
      };

      enqueue("retry: 1000\n\n");
      addSubscriber(webSession, subscriber);

      keepAlive = setInterval(() => enqueue(": keep-alive\n\n"), 30_000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (keepAlive) clearInterval(keepAlive);
        removeSubscriber(webSession, subscriber);
        try {
          controller.close();
        } catch {
          // Stream may already be closed by the client.
        }
      };

      request.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      closed = true;
      if (keepAlive) clearInterval(keepAlive);
      if (subscriber) removeSubscriber(webSession, subscriber);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}

function handleModels(): Response {
  return json(ModelsResponseSchema, {
    models: services.modelRegistry.getAvailable().map((model) => ({
      provider: model.provider,
      id: model.id,
      name: model.name || model.id,
      api: model.api,
      reasoning: model.reasoning,
    })),
  });
}

async function handleSetModel(webSession: WebSession, request: Request): Promise<Response> {
  if (webSession.session.isStreaming) return jsonError("Cannot change model while streaming", 409);

  const { provider, id: modelId } = await parseJsonBody(request, SetModelRequestSchema);

  const model = services.modelRegistry.find(provider, modelId);
  if (!model) return jsonError(`Model not found: ${provider}/${modelId}`, 404);

  const available = services.modelRegistry.getAvailable();
  if (!available.some((candidate) => candidate.provider === provider && candidate.id === modelId)) {
    return jsonError(`Model is not available: ${provider}/${modelId}`, 400);
  }

  await webSession.session.setModel(model);
  notifyState(webSession);
  return json(SetModelResponseSchema, { ok: true, model: modelToJson(webSession.session.model) });
}

function handleApiError(error: unknown): Response {
  if (error instanceof Response) return error;
  const message = error instanceof Error ? error.message : String(error);
  return jsonError(message, 500);
}

function apiRoute(handler: (request: BunRequest) => Response | Promise<Response>) {
  return async (request: BunRequest) => {
    try {
      return await handler(request);
    } catch (error) {
      return handleApiError(error);
    }
  };
}

const server = Bun.serve({
  hostname: config.host,
  port: config.port,
  routes: {
    "/": homepage,

    "/api/health": {
      GET: apiRoute(() => json(HealthResponseSchema, { ok: true })),
    },
    "/api/models": {
      GET: apiRoute(() => handleModels()),
    },
    "/api/sessions": {
      GET: apiRoute(() => handleListSessions()),
      POST: apiRoute(() => handleCreateSession()),
    },
    "/api/sessions/:id": {
      GET: apiRoute((request) => handleWithSession(request, handleGetSession)),
    },
    "/api/sessions/:id/messages": {
      GET: apiRoute((request) => handleWithSession(request, handleGetMessages)),
    },
    "/api/sessions/:id/prompt": {
      POST: apiRoute((request) => handleWithSession(request, handlePrompt)),
    },
    "/api/sessions/:id/model": {
      PUT: apiRoute((request) => handleWithSession(request, handleSetModel)),
    },
    "/api/sessions/:id/abort": {
      POST: apiRoute((request) => handleWithSession(request, handleAbort)),
    },
    "/api/sessions/:id/events": {
      GET: apiRoute((request) => handleWithSession(request, handleEvents)),
    },
    "/api/*": apiRoute(() => notFound()),
  },
  development: isDevelopment ? { hmr: true, console: true } : false,
  error(error) {
    return jsonError(error.message, 500);
  },
});

console.log(`pi-web listening on http://${server.hostname}:${server.port}`);
console.log(`cwd: ${config.cwd}`);
console.log(`tools: ${config.tools.join(", ")}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await disposeAllSessions();
    server.stop(true);
    process.exit(0);
  });
}
