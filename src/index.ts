import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { loadConfig } from "./config.js";
import { createDb, runMigrations } from "./db/client.js";

const config = loadConfig();

const db = createDb(config.databaseUrl);
await runMigrations(db);

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`wave-flow-cloud listening on http://127.0.0.1:${info.port}`);
});
