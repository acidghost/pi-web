import type { BunRequest } from "bun";
import homepage from "./index.html";
import { loadConfig } from "./pi/config.ts";
import {
  addSubscriber,
  createServices,
  createWebSession,
  disposeAllSessions,
  getWebSession,
  modelToJson,
  notifyError,
  notifyState,
  removeSubscriber,
  sessionMetadata,
} from "./pi/session-manager.ts";
import { normalizeMessages, sseData } from "./pi/streaming.ts";
import type { SseSubscriber, WebSession } from "./pi/types.ts";

const config = loadConfig();
const services = createServices(config);

const isDevelopment = process.env.NODE_ENV !== "production";

function json(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...commonResponseHeaders } });
}

function jsonError(message: string, status = 500): Response {
  return json({ error: { message } }, status);
}

function notFound(): Response {
  return jsonError("Not found", 404);
}

const commonResponseHeaders: Record<string, string> = {
  "content-type": "application/json; charset=utf-8",
};

async function parseJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Response(JSON.stringify({ error: { message: "Expected application/json" } }), {
      status: 415,
      headers: { ...commonResponseHeaders },
    });
  }
  try {
    return await request.json();
  } catch {
    throw new Response(JSON.stringify({ error: { message: "Invalid JSON body" } }), {
      status: 400,
      headers: { ...commonResponseHeaders },
    });
  }
}

async function handleCreateSession(): Promise<Response> {
  const webSession = await createWebSession(config, services);
  return json({ sessionId: webSession.id }, 201);
}

async function handleWithSession(
  request: BunRequest,
  handler: (session: WebSession, request: BunRequest) => Promise<Response>,
): Promise<Response> {
  const id = request.params.id;
  if (!id) return notFound();
  const webSession = getWebSession(id);
  if (!webSession) return notFound();
  return await handler(webSession, request);
}

async function handleGetSession(webSession: WebSession): Promise<Response> {
  return json(sessionMetadata(config, webSession));
}

async function handleGetMessages(webSession: WebSession): Promise<Response> {
  return json({
    messages: normalizeMessages(webSession.session.messages),
    agentMessages: webSession.session.messages,
  });
}

async function handlePrompt(webSession: WebSession, request: Request): Promise<Response> {
  const body = await parseJsonBody(request);
  const message =
    typeof body === "object" && body !== null && "message" in body
      ? (body as { message?: unknown }).message
      : undefined;
  if (typeof message !== "string" || message.trim().length === 0) {
    return jsonError("Message must be a non-empty string", 400);
  }

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
    const run = webSession.session.prompt(message.trim(), {
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
  return json({ accepted: true }, 202);
}

async function handleAbort(webSession: WebSession): Promise<Response> {
  await webSession.session.abort();
  notifyState(webSession);
  return json({ ok: true });
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
  return json({
    models: services.modelRegistry.getAvailable().map((model) => ({
      ...modelToJson(model),
      api: model.api,
      reasoning: model.reasoning,
    })),
  });
}

async function handleSetModel(webSession: WebSession, request: Request): Promise<Response> {
  if (webSession.session.isStreaming) return jsonError("Cannot change model while streaming", 409);

  const body = await parseJsonBody(request);
  const provider =
    typeof body === "object" && body !== null && "provider" in body
      ? (body as { provider?: unknown }).provider
      : undefined;
  const modelId =
    typeof body === "object" && body !== null && "id" in body
      ? (body as { id?: unknown }).id
      : undefined;

  if (typeof provider !== "string" || typeof modelId !== "string") {
    return jsonError("Model provider and id are required", 400);
  }

  const model = services.modelRegistry.find(provider, modelId);
  if (!model) return jsonError(`Model not found: ${provider}/${modelId}`, 404);

  const available = services.modelRegistry.getAvailable();
  if (!available.some((candidate) => candidate.provider === provider && candidate.id === modelId)) {
    return jsonError(`Model is not available: ${provider}/${modelId}`, 400);
  }

  await webSession.session.setModel(model);
  notifyState(webSession);
  return json({ ok: true, model: modelToJson(webSession.session.model) });
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
      GET: apiRoute(() => json({ ok: true })),
    },
    "/api/models": {
      GET: apiRoute(() => handleModels()),
    },
    "/api/sessions": {
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
