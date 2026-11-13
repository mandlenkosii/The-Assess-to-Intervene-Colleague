// Loads the repo-root .env no matter which directory the server is started from.
import { config } from "dotenv";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });

export const env = {
  PORT: Number(process.env.PORT || 3001),
  GROQ_API_KEY: process.env.GROQ_API_KEY || "",
  GROQ_MODEL_LARGE: process.env.GROQ_MODEL_LARGE || "llama-3.3-70b-versatile",
  GROQ_MODEL_SMALL: process.env.GROQ_MODEL_SMALL || "llama-3.1-8b-instant",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  CONCURRENCY: Number(process.env.CONCURRENCY || 4),
  LLM_TIMEOUT_MS: Number(process.env.LLM_TIMEOUT_MS || 60000),
  NO_CACHE: process.env.NO_CACHE === "1",
  // FAKE_LLM=1 runs the app on the deterministic fake model (no keys, no rate limits) for UI work and rehearsals.
  FAKE_LLM: process.env.FAKE_LLM === "1",
  FAKE_LLM_LATENCY_MS: Number(process.env.FAKE_LLM_LATENCY_MS || 250),
};
