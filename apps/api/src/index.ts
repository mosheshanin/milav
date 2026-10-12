import { Hono } from "hono";

// Секреты приходят из окружения Worker (wrangler secret put / .dev.vars).
export type Bindings = {
  BOT_TOKEN?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/api/health", (c) => c.json({ ok: true, service: "milav-api" }));

app.notFound((c) => c.json({ error: "not_found" }, 404));

export default app;
