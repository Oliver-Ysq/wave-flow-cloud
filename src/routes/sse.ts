import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { requireAuth, type AuthVariables } from "../auth/middleware.js";
import type { AppConfig } from "../config.js";
import type { Db } from "../db/client.js";
import { harnessSessions, sessionMessages } from "../db/schema.js";
import type { SseHub } from "../gateway/sse.js";
import {
  PROTOCOL_VERSION,
  messagesSnapshotEvent,
  sessionStatusEvent,
  type Message,
} from "../protocol/agui.js";

/** UUID 格式校验：非法 id 按不存在处理。 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** SSE 心跳间隔：防止中间代理因空闲断开长连接。 */
const DEFAULT_HEARTBEAT_MS = 20_000;

/** 把 session_messages 行映射为 AG-UI 消息（按 idx 顺序）。 */
function toAgUiMessages(
  sessionId: string,
  rows: { idx: number; role: string; content: unknown }[],
): Message[] {
  return rows.map((row) => {
    const body = (row.content ?? {}) as Record<string, unknown>;
    const id = `${sessionId}:${row.idx}`;
    const content = typeof body.content === "string" ? body.content : "";
    if (row.role === "user") {
      return { id, role: "user", content };
    }
    if (row.role === "assistant") {
      return {
        id,
        role: "assistant",
        ...(content ? { content } : {}),
        ...(Array.isArray(body.toolCalls) ? { toolCalls: body.toolCalls } : {}),
      } as Message;
    }
    if (row.role === "tool") {
      return {
        id,
        role: "tool",
        content,
        toolCallId: typeof body.toolCallId === "string" ? body.toolCallId : "",
      };
    }
    return { id, role: "system", content };
  });
}

/** SSE 网关路由：建立 AG-UI 事件流。 */
export function createSseRoutes(deps: {
  db: Db;
  config: AppConfig;
  hub: SseHub;
  heartbeatMs?: number;
}) {
  const app = new Hono<{ Variables: AuthVariables }>();
  const auth = requireAuth(deps.config.jwtSecret);
  const heartbeatMs = deps.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;

  /** 建立 SSE：校验归属与协议版本，下发状态 + 消息快照并持续推帧。 */
  app.post("/sse/:sessionId", auth, async (c) => {
    const sessionId = c.req.param("sessionId");
    if (!UUID_PATTERN.test(sessionId)) {
      return c.json({ error: "not found" }, 404);
    }

    const [session] = await deps.db
      .select({ id: harnessSessions.id, status: harnessSessions.status })
      .from(harnessSessions)
      .where(
        and(eq(harnessSessions.id, sessionId), eq(harnessSessions.userId, c.get("userId"))),
      )
      .limit(1);
    if (!session) {
      return c.json({ error: "not found" }, 404);
    }

    // AG-UI 的版本协商在 RunAgentInput / RUN_STARTED 中带内进行；
    // 传输层可选声明 header，提前拒绝明确不兼容的客户端。
    const clientVersion = c.req.header("x-ag-ui-version");
    if (clientVersion !== undefined && clientVersion !== PROTOCOL_VERSION) {
      return c.json(
        { error: "ag-ui protocol version mismatch", expected: PROTOCOL_VERSION },
        426,
      );
    }

    const rows = await deps.db
      .select({ idx: sessionMessages.idx, role: sessionMessages.role, content: sessionMessages.content })
      .from(sessionMessages)
      .where(eq(sessionMessages.sessionId, sessionId))
      .orderBy(asc(sessionMessages.idx));

    const initialEvents = [
      sessionStatusEvent(session.status === "interrupted" ? "interrupted" : "active"),
      messagesSnapshotEvent(toAgUiMessages(sessionId, rows)),
    ];

    await deps.db
      .update(harnessSessions)
      .set({ lastSeenAt: new Date().toISOString() })
      .where(eq(harnessSessions.id, sessionId));

    const clientId = randomUUID();
    return streamSSE(c, async (stream) => {
      let closed = false;
      const client = {
        id: clientId,
        write: (frame: { id?: number; event: unknown }) => {
          if (closed) return;
          // AG-UI 事件自带 type，作为 data 的 JSON 下发；不使用 SSE 的 event 字段。
          void stream
            .writeSSE({
              id: frame.id?.toString(),
              data: JSON.stringify(frame.event),
            })
            .catch(() => {
              closed = true;
            });
        },
        close: () => {
          closed = true;
          void stream.close();
        },
      };

      deps.hub.connect(sessionId, client, initialEvents);

      const timer =
        heartbeatMs > 0
          ? setInterval(() => {
              if (closed) return;
              void stream.write(": keepalive\n\n").catch(() => {
                closed = true;
              });
            }, heartbeatMs)
          : undefined;

      await new Promise<void>((resolve) => {
        stream.onAbort(() => resolve());
      });

      if (timer) clearInterval(timer);
      deps.hub.disconnect(sessionId, clientId);
    });
  });

  return app;
}
