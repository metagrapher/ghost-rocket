import { DurableObject } from "cloudflare:workers";

interface Env {
    GUN_RELAY: DurableObjectNamespace;
}

export class GunRelay extends DurableObject<Env> {
    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
    }

    async fetch(request: Request): Promise<Response> {
        if (request.headers.get("Upgrade") === "websocket") {
            const pair = new WebSocketPair();
            const [client, server] = Object.values(pair);

            this.ctx.acceptWebSocket(server);

            return new Response(null, {
                status: 101,
                webSocket: client,
            });
        }

        return new Response("GunRelay DO is running", { status: 200 });
    }

    async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
        // Broadcast to all other connections
        // TODO: Implement Gun.js protocol handling or smarter forwarding
        this.ctx.getWebSockets().forEach((other) => {
            if (other !== ws) {
                try {
                    other.send(message);
                } catch (e) {
                    // Ignore closed connections
                }
            }
        });
    }

    async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
        // Handle cleanup
    }
}
