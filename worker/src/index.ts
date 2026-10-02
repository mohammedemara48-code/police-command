export interface Env {
  ROOM: DurableObjectNamespace;
  ALLOWED_ORIGINS: string;
}

type ClientMsg =
  | { type: "join"; name?: string }
  | { type: "ping" }
  | { type: "incident"; payload: unknown }
  | { type: "dispatch"; payload: unknown }
  | { type: "state"; payload: unknown };

function corsHeaders(origin: string | null, allowed: string): HeadersInit {
  const list = allowed.split(",").map((s) => s.trim()).filter(Boolean);
  const ok =
    origin && (list.includes(origin) || list.includes("*"))
      ? origin
      : list[0] || "*";
  return {
    "Access-Control-Allow-Origin": ok,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin, env.ALLOWED_ORIGINS || "");

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      return Response.json(
        { ok: true, service: "police-command-rooms", ts: Date.now() },
        { headers: cors }
      );
    }

    // WebSocket room: /room/:id
    const m = url.pathname.match(/^\/room\/([a-zA-Z0-9_-]{1,64})$/);
    if (m) {
      const id = env.ROOM.idFromName(m[1]);
      const stub = env.ROOM.get(id);
      return stub.fetch(request);
    }

    return Response.json({ error: "not_found" }, { status: 404, headers: cors });
  },
};

export class GameRoom {
  private state: DurableObjectState;
  private sessions = new Map<WebSocket, { name: string; joinedAt: number }>();
  private game: {
    incidents: unknown[];
    dispatches: unknown[];
    shared: Record<string, unknown>;
  } = { incidents: [], dispatches: [], shared: {} };

  constructor(state: DurableObjectState) {
    this.state = state;
    this.state.getWebSockets().forEach((ws) => {
      this.sessions.set(ws, { name: "recovered", joinedAt: Date.now() });
    });
  }

  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get("Upgrade");
    if (upgrade?.toLowerCase() !== "websocket") {
      return Response.json({
        players: this.sessions.size,
        incidents: this.game.incidents.length,
        dispatches: this.game.dispatches.length,
      });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.state.acceptWebSocket(server);
    this.sessions.set(server, { name: "guest", joinedAt: Date.now() });

    server.send(
      JSON.stringify({
        type: "welcome",
        players: this.sessions.size,
        state: this.game,
      })
    );
    this.broadcast(
      { type: "presence", players: this.sessions.size },
      server
    );

    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    let data: ClientMsg;
    try {
      data = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
    } catch {
      ws.send(JSON.stringify({ type: "error", error: "bad_json" }));
      return;
    }

    switch (data.type) {
      case "join": {
        const meta = this.sessions.get(ws);
        if (meta) meta.name = (data.name || "officer").slice(0, 32);
        this.broadcast({
          type: "presence",
          players: this.sessions.size,
          names: [...this.sessions.values()].map((s) => s.name),
        });
        break;
      }
      case "ping":
        ws.send(JSON.stringify({ type: "pong", t: Date.now() }));
        break;
      case "incident":
        this.game.incidents.push(data.payload);
        if (this.game.incidents.length > 50) this.game.incidents.shift();
        this.broadcast({ type: "incident", payload: data.payload }, ws);
        break;
      case "dispatch":
        this.game.dispatches.push(data.payload);
        if (this.game.dispatches.length > 80) this.game.dispatches.shift();
        this.broadcast({ type: "dispatch", payload: data.payload }, ws);
        break;
      case "state":
        this.game.shared = {
          ...this.game.shared,
          ...(data.payload as Record<string, unknown>),
        };
        this.broadcast({ type: "state", payload: this.game.shared }, ws);
        break;
      default:
        ws.send(JSON.stringify({ type: "error", error: "unknown_type" }));
    }
  }

  webSocketClose(ws: WebSocket) {
    this.sessions.delete(ws);
    this.broadcast({ type: "presence", players: this.sessions.size });
  }

  webSocketError(ws: WebSocket) {
    this.sessions.delete(ws);
  }

  private broadcast(msg: unknown, except?: WebSocket) {
    const raw = JSON.stringify(msg);
    for (const sock of this.sessions.keys()) {
      if (sock !== except) {
        try {
          sock.send(raw);
        } catch {
          this.sessions.delete(sock);
        }
      }
    }
  }
}
