// Express entry point. Phase 0: health route + static web build. Run routes arrive in phase 1.
import express from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { env, ROOT } from "./env.js";

const app = express();
app.use(express.json({ limit: "5mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, groq: Boolean(env.GROQ_API_KEY), gemini: Boolean(env.GEMINI_API_KEY) });
});

// Production: serve the built web app from the same port.
const dist = join(ROOT, "web", "dist");
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(join(dist, "index.html")));
}

app.listen(env.PORT, () => console.log(`server on http://localhost:${env.PORT}`));
