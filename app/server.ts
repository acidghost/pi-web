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

function json(data: unknown, init: ResponseInit | number = 200): Response {
  const status = typeof init === "number" ? init : (init.status ?? 200);
  const headers = new Headers(typeof init === "number" ? undefined : init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), {
    ...(typeof init === "number" ? {} : init),
    status,
    headers,
  });
}

function jsonError(message: string, status = 500): Response {
  return json({ error: { message } }, status);
}

function notFound(): Response {
  return jsonError("Not found", 404);
}

async function parseJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Response(JSON.stringify({ error: { message: "Expected application/json" } }), {
      status: 415,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
  try {
    return await request.json();
  } catch {
    throw new Response(JSON.stringify({ error: { message: "Invalid JSON body" } }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}

function getSessionOr404(id: string | undefined): WebSession | Response {
  if (!id) return notFound();
  return getWebSession(id) ?? notFound();
}

async function handleCreateSession(): Promise<Response> {
  const webSession = await createWebSession(config, services);
  return json({ sessionId: webSession.id }, 201);
}

function handleGetSession(id: string | undefined): Response {
  const webSession = getSessionOr404(id);
  if (webSession instanceof Response) return webSession;
  return json(sessionMetadata(config, webSession));
}

function handleGetMessages(id: string | undefined): Response {
  const webSession = getSessionOr404(id);
  if (webSession instanceof Response) return webSession;
  return json({
    messages: normalizeMessages(webSession.session.messages),
    agentMessages: webSession.session.messages,
  });
}

async function handlePrompt(id: string | undefined, request: Request): Promise<Response> {
  const webSession = getSessionOr404(id);
  if (webSession instanceof Response) return webSession;

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

async function handleAbort(id: string | undefined): Promise<Response> {
  const webSession = getSessionOr404(id);
  if (webSession instanceof Response) return webSession;
  await webSession.session.abort();
  notifyState(webSession);
  return json({ ok: true });
}

function handleEvents(id: string | undefined, request: Request): Response {
  const webSession = getSessionOr404(id);
  if (webSession instanceof Response) return webSession;

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

type RouteRequest = Request & { params: Record<string, string> };

function handleApiError(error: unknown): Response {
  if (error instanceof Response) return error;
  const message = error instanceof Error ? error.message : String(error);
  return jsonError(message, 500);
}

function apiRoute(handler: (request: RouteRequest) => Response | Promise<Response>) {
  return async (request: RouteRequest) => {
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
      GET: apiRoute((request) => handleGetSession(request.params.id)),
    },
    "/api/sessions/:id/messages": {
      GET: apiRoute((request) => handleGetMessages(request.params.id)),
    },
    "/api/sessions/:id/prompt": {
      POST: apiRoute((request) => handlePrompt(request.params.id, request)),
    },
    "/api/sessions/:id/abort": {
      POST: apiRoute((request) => handleAbort(request.params.id)),
    },
    "/api/sessions/:id/events": {
      GET: apiRoute((request) => handleEvents(request.params.id, request)),
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
