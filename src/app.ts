import { Hono } from "hono";
import type { AppConfig } from "./config.js";
import type { Db } from "./db/client.js";
import { SseHub } from "./gateway/sse.js";
import { createAuthRoutes } from "./routes/auth.js";
import { createCredentialRoutes } from "./routes/credentials.js";
import { createSessionRoutes } from "./routes/sessions.js";
import { createSseRoutes } from "./routes/sse.js";

/** 组装 HTTP 应用：所有依赖显式传入，便于集成测试复用同一套路由。 */
export function createApp(deps: { db: Db; config: AppConfig; hub?: SseHub }) {
  const hub = deps.hub ?? new SseHub();
  const app = new Hono();

  app.get("/health", (c) => c.json({ status: "ok" }));
  app.route("/", createAuthRoutes({ db: deps.db, config: deps.config }));
  app.route("/", createCredentialRoutes({ db: deps.db, config: deps.config }));
  app.route("/", createSessionRoutes({ db: deps.db, config: deps.config, hub }));
  app.route("/", createSseRoutes({ db: deps.db, config: deps.config, hub }));

  return app;
}
