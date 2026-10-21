import type { MiddlewareHandler } from "hono";
import { verifyAuthToken } from "./jwt.js";

/** 认证中间件写入的上下文变量。 */
export type AuthVariables = {
  /** 已验签的当前用户内部 id（users.id）。 */
  userId: string;
};

/** Bearer 认证中间件：缺失/非法/过期令牌一律 401，不暴露具体原因。 */
export function requireAuth(
  secret: string,
): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const header = c.req.header("Authorization");
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
    if (!token) {
      return c.json({ error: "unauthorized" }, 401);
    }
    try {
      c.set("userId", await verifyAuthToken(token, secret));
      await next();
    } catch {
      return c.json({ error: "unauthorized" }, 401);
    }
  };
}
