import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { loadConfig } from "./config.js";

const config = loadConfig();

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`wave-flow-cloud listening on http://127.0.0.1:${info.port}`);
});
