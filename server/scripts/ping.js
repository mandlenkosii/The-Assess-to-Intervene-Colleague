// H2 checkpoint: proves a model call returns validated JSON. Run: npm run ping
import { z } from "zod";
import { createLLM } from "../llm.js";
import { env } from "../env.js";

const Pong = z.object({ ok: z.boolean(), subject: z.string(), fact: z.string() });
const llm = createLLM({ log: console.log });

console.log(`providers: groq=${env.GROQ_API_KEY ? env.GROQ_MODEL_LARGE : "off"} gemini=${env.GEMINI_API_KEY ? env.GEMINI_MODEL : "off"}`);
const t0 = Date.now();
try {
  const out = await llm.json(
    [
      { role: "system", content: 'You are a health check. Shape: {"ok": true, "subject": string, "fact": string}' },
      { role: "user", content: "Give one short fact about marking school essays fairly." },
    ],
    { schema: Pong, tier: "small", cache: process.argv.includes("--cache") },
  );
  console.log("result:", out);
  console.log(`ok in ${Date.now() - t0}ms`, llm.stats);
} catch (err) {
  console.error("ping failed:", err.message);
  process.exit(1);
}
