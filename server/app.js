// Builds the Express app. Dependencies are injectable so tests can run it with a stub model.
import express from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { env, ROOT } from "./env.js";
import { createLLM } from "./llm.js";
import { createRunStore } from "./runStore.js";
import { runsRouter } from "./routes/runs.js";

export function createApp({ store = createRunStore(), llm = createLLM({ log: console.log }), agents } = {}) {
  const app = express();
  app.use(express.json({ limit: "5mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, status: "ok", groq: Boolean(env.GROQ_API_KEY), gemini: Boolean(env.GEMINI_API_KEY), llm: llm.stats ?? null });
  });
  app.use("/api", runsRouter({ store, llm, agents }));

  // Production: serve the built web app from the same port.
  const dist = join(ROOT, "web", "dist");
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(join(dist, "index.html")));
  }
  return { app, store, llm };
}
