import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "../auth/middleware.js";
import type { AppConfig } from "../config.js";
import type { Db } from "../db/client.js";
import { credentials, harnessSessions } from "../db/schema.js";
import type { SseHub } from "../gateway/sse.js";

/** 会话标题长度上限。 */
const MAX_TITLE_LENGTH = 200;
/** 模型标识长度上限。 */
const MAX_MODEL_LENGTH = 100;
/** 未提供标题时的默认值。 */
const DEFAULT_TITLE = "未命名会话";
/** UUID 格式校验：非法 id 直接按不存在处理，避免数据库类型错误变成 500。 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 会话创建时上报的能力档位；两项默认关闭。 */
export type SessionFeatures = {
  /** 是否允许云端主控查询工作区（A 档）。 */
  readonly workspaceQuery: boolean;
  /** 是否允许云端主控读取工作区外文件（B 档）。 */
  readonly externalFileRead: boolean;
};

/** 校验并归一化 features；非法形状返回 null（路由回 400）。 */
function parseFeatures(value: unknown): SessionFeatures | null {
  if (value === undefined || value === null) {
    return { workspaceQuery: false, externalFileRead: false };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const workspaceQuery = candidate.workspaceQuery ?? false;
  const externalFileRead = candidate.externalFileRead ?? false;
  if (typeof workspaceQuery !== "boolean" || typeof externalFileRead !== "boolean") {
    return null;
  }
  return { workspaceQuery, externalFileRead };
}

/** 会话管理路由：创建、列表、删除；所有操作按当前用户隔离。 */
export function createSessionRoutes(deps: { db: Db; config: AppConfig; hub: SseHub }) {
  const app = new Hono<{ Variables: AuthVariables }>();
  const auth = requireAuth(deps.config.jwtSecret);

  /** 创建会话：必须已录入模型凭据；features 决定云端主控可用的查询档位。 */
  app.post("/api/sessions", auth, async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      title?: unknown;
      model?: unknown;
      features?: unknown;
    } | null;

    const rawTitle = typeof body?.title === "string" ? body.title.trim() : "";
    const title = rawTitle || DEFAULT_TITLE;
    if (title.length > MAX_TITLE_LENGTH) {
      return c.json({ error: "title too long" }, 400);
    }

    const rawModel = typeof body?.model === "string" ? body.model.trim() : "";
    if (rawModel.length > MAX_MODEL_LENGTH) {
      return c.json({ error: "model too long" }, 400);
    }

    const features = parseFeatures(body?.features);
    if (!features) {
      return c.json({ error: "invalid features" }, 400);
    }

    const userId = c.get("userId");
    const [credential] = await deps.db
      .select({ id: credentials.id })
      .from(credentials)
      .where(eq(credentials.userId, userId))
      .limit(1);
    if (!credential) {
      return c.json(
        { error: "credential required", message: "请先通过 PUT /api/credentials 录入模型 API Key" },
        400,
      );
    }

    const [session] = await deps.db
      .insert(harnessSessions)
      .values({
        userId,
        title,
        model: rawModel || null,
        features,
      })
      .returning({
        id: harnessSessions.id,
        title: harnessSessions.title,
        model: harnessSessions.model,
        status: harnessSessions.status,
        features: harnessSessions.features,
        createdAt: harnessSessions.createdAt,
      });

    return c.json(session, 201);
  });

  /** 列出当前用户的会话，按创建时间倒序。 */
  app.get("/api/sessions", auth, async (c) => {
    const sessions = await deps.db
      .select({
        id: harnessSessions.id,
        title: harnessSessions.title,
        model: harnessSessions.model,
        status: harnessSessions.status,
        features: harnessSessions.features,
        createdAt: harnessSessions.createdAt,
        lastSeenAt: harnessSessions.lastSeenAt,
      })
      .from(harnessSessions)
      .where(eq(harnessSessions.userId, c.get("userId")))
      .orderBy(desc(harnessSessions.createdAt));
    return c.json({ sessions });
  });

  /** 删除会话及其全部消息现场（外键 cascade）；非本人或不存在统一 404。 */
  app.delete("/api/sessions/:id", auth, async (c) => {
    const id = c.req.param("id");
    if (!UUID_PATTERN.test(id)) {
      return c.json({ error: "not found" }, 404);
    }
    const deleted = await deps.db
      .delete(harnessSessions)
      .where(and(eq(harnessSessions.id, id), eq(harnessSessions.userId, c.get("userId"))))
      .returning({ id: harnessSessions.id });
    if (deleted.length === 0) {
      return c.json({ error: "not found" }, 404);
    }
    // 关闭该会话的活跃 SSE 连接并清理内存状态，避免空桶常驻。
    deps.hub.dispose(id);
    return c.body(null, 204);
  });

  return app;
}
