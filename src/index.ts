import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { loadConfig } from "./config.js";
import { createDb, runMigrations } from "./db/client.js";
import { createAuthRoutes } from "./routes/auth.js";
import { createCredentialRoutes } from "./routes/credentials.js";
import { createSessionRoutes } from "./routes/sessions.js";

const config = loadConfig();

const db = createDb(config.databaseUrl);
await runMigrations(db);

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));

// 挂载子路由，认证模块
app.route("/", createAuthRoutes({ db, config }));
app.route("/", createCredentialRoutes({ db, config }));
app.route("/", createSessionRoutes({ db, config }));

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`wave-flow-cloud listening on http://127.0.0.1:${info.port}`);
});
