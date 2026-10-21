import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb, runMigrations } from "./db/client.js";
import { SseHub } from "./gateway/sse.js";

const config = loadConfig();

const db = createDb(config.databaseUrl);
await runMigrations(db);

const hub = new SseHub();
const app = createApp({ db, config, hub });

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`wave-flow-cloud listening on http://127.0.0.1:${info.port}`);
});
