import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "../auth/middleware.js";
import type { AppConfig } from "../config.js";
import { encryptSecret } from "../crypto/credentials.js";
import type { Db } from "../db/client.js";
import { credentials } from "../db/schema.js";

/** API key 长度上限：远大于常见 key，同时限制请求体大小。 */
const MAX_API_KEY_LENGTH = 256;

/** 模型凭据相关路由：保存/替换、查询元数据、删除。 */
export function createCredentialRoutes(deps: { db: Db; config: AppConfig }) {
  const app = new Hono<{ Variables: AuthVariables }>();
  const auth = requireAuth(deps.config.jwtSecret);

  /** 保存或替换当前用户的模型 API key；响应永不包含明文或密文。 */
  app.put("/api/credentials", auth, async (c) => {
    const body = (await c.req.json().catch(() => null)) as { apiKey?: unknown } | null;
    const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
    if (!apiKey) {
      return c.json({ error: "apiKey is required" }, 400);
    }
    if (apiKey.length > MAX_API_KEY_LENGTH) {
      return c.json({ error: "apiKey too long" }, 400);
    }

    const encrypted = encryptSecret(apiKey, deps.config.masterKey);
    const [row] = await deps.db
      .insert(credentials)
      .values({
        userId: c.get("userId"),
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      })
      .onConflictDoUpdate({
        target: credentials.userId,
        set: {
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
        },
      })
      .returning({
        id: credentials.id,
        createdAt: credentials.createdAt,
        lastUsedAt: credentials.lastUsedAt,
      });

    return c.json({
      configured: true,
      id: row.id,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
    });
  });

  /** 查询凭据元数据（是否已配置、时间戳），不返回密文。 */
  app.get("/api/credentials", auth, async (c) => {
    const [row] = await deps.db
      .select({
        id: credentials.id,
        createdAt: credentials.createdAt,
        lastUsedAt: credentials.lastUsedAt,
      })
      .from(credentials)
      .where(eq(credentials.userId, c.get("userId")))
      .limit(1);
    if (!row) {
      return c.json({ configured: false });
    }
    return c.json({ configured: true, ...row });
  });

  /** 删除当前用户凭据（物理删除；轮换即删除后重新保存）。 */
  app.delete("/api/credentials", auth, async (c) => {
    await deps.db.delete(credentials).where(eq(credentials.userId, c.get("userId")));
    return c.body(null, 204);
  });

  return app;
}
