import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { GithubOAuthClient } from "../auth/github.js";
import { signAuthToken, signOAuthState, verifyOAuthState } from "../auth/jwt.js";
import { requireAuth, type AuthVariables } from "../auth/middleware.js";
import type { AppConfig } from "../config.js";
import type { Db } from "../db/client.js";
import { users } from "../db/schema.js";

/** 回调结束后仅允许重定向到本机回环地址，避免开放重定向。 */
const LOOPBACK_PREFIXES = ["http://127.0.0.1:", "http://localhost:"];

function isLoopbackRedirect(value: string): boolean {
  return LOOPBACK_PREFIXES.some((prefix) => value.startsWith(prefix));
}

/** 认证相关路由：OAuth 登录、回调与当前用户查询。 */
export function createAuthRoutes(deps: { db: Db; config: AppConfig }) {
  const app = new Hono<{ Variables: AuthVariables }>();
  const github = new GithubOAuthClient(deps.config);

  /** 发起登录：签发 state 后重定向到 GitHub 授权页。 */
  app.get("/auth/github", async (c) => {
    const state = await signOAuthState(deps.config.jwtSecret);
    return c.redirect(github.buildAuthorizeUrl(state));
  });

  /** OAuth 回调：验 state → code 换 token → 取用户 → upsert → 签发 JWT。 */
  app.get("/auth/github/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const redirect = c.req.query("redirect");
    if (!code || !state) {
      return c.json({ error: "missing code or state" }, 400);
    }
    try {
      await verifyOAuthState(state, deps.config.jwtSecret);
    } catch {
      return c.json({ error: "invalid state" }, 400);
    }

    const accessToken = await github.exchangeCode(code);
    const profile = await github.fetchUser(accessToken);
    const [user] = await deps.db
      .insert(users)
      .values({ githubId: profile.id, login: profile.login, avatarUrl: profile.avatarUrl })
      .onConflictDoUpdate({
        target: users.githubId,
        set: { login: profile.login, avatarUrl: profile.avatarUrl },
      })
      .returning();

    const token = await signAuthToken(user.id, deps.config.jwtSecret);
    if (redirect && isLoopbackRedirect(redirect)) {
      return c.redirect(`${redirect}?token=${encodeURIComponent(token)}`);
    }
    // 验收页的示例地址跟随实际请求来源，避免写死端口。
    const safeOrigin = new URL(c.req.url).origin.replace(/[^a-zA-Z0-9.:/-]/g, "");
    return c.html(renderTokenPage(token, safeOrigin));
  });

  /** 当前用户：JWT 中间件验签后按 sub 查询。 */
  app.get("/api/me", requireAuth(deps.config.jwtSecret), async (c) => {
    const [user] = await deps.db
      .select()
      .from(users)
      .where(eq(users.id, c.get("userId")))
      .limit(1);
    if (!user) {
      // token 合法但用户已被删除：按未认证处理。
      return c.json({ error: "unauthorized" }, 401);
    }
    return c.json({
      id: user.id,
      githubId: user.githubId,
      login: user.login,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
    });
  });

  return app;
}

/** 无客户端阶段的验收页：仅展示 JWT，便于复制到 curl 使用（设计 §8）。 */
function renderTokenPage(token: string, origin: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>登录成功</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 860px; margin: 48px auto; padding: 0 16px; }
  textarea { width: 100%; box-sizing: border-box; font-family: monospace; }
  pre { background: #f4f4f4; padding: 12px; overflow-x: auto; }
</style>
</head>
<body>
<h1>GitHub 登录成功</h1>
<p>复制下面的 JWT，用于 API 调试：</p>
<textarea readonly rows="4">${token}</textarea>
<p>示例：</p>
<pre>curl -H "Authorization: Bearer &lt;JWT&gt;" ${origin}/api/me</pre>
</body>
</html>`;
}
