// Loads the repo-root .env no matter which directory the server is started from.
import { config } from "dotenv";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });

const list = (value) => String(value).split(",").map((s) => s.trim()).filter(Boolean);

export const env = {
  PORT: Number(process.env.PORT || 3001),
  GROQ_API_KEY: process.env.GROQ_API_KEY || "",
  GROQ_MODEL_LARGE: process.env.GROQ_MODEL_LARGE || "openai/gpt-oss-120b",
  GROQ_MODEL_SMALL: process.env.GROQ_MODEL_SMALL || "openai/gpt-oss-20b",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
  // Free-tier quotas are per model: when a model's DAILY quota is used up, these same-key models answer instead
  // (in order) before falling back to the other provider. Empty = off.
  GEMINI_EXTRA_MODELS: list(process.env.GEMINI_EXTRA_MODELS ?? "gemini-3.1-flash-lite,gemini-3-flash-preview,gemini-3.5-flash"),
  GROQ_EXTRA_MODELS: list(process.env.GROQ_EXTRA_MODELS ?? "openai/gpt-oss-20b"),
  // Which provider answers first ("gemini" or "groq"); the other is the fallback.
  LLM_PRIMARY: (process.env.LLM_PRIMARY || "gemini").toLowerCase() === "groq" ? "groq" : "gemini",
  CONCURRENCY: Number(process.env.CONCURRENCY || 4),
  LLM_TIMEOUT_MS: Number(process.env.LLM_TIMEOUT_MS || 60000),
  NO_CACHE: process.env.NO_CACHE === "1",
  // FAKE_LLM=1 runs the app on the deterministic fake model (no keys, no rate limits) for UI work and rehearsals.
  FAKE_LLM: process.env.FAKE_LLM === "1",
  FAKE_LLM_LATENCY_MS: Number(process.env.FAKE_LLM_LATENCY_MS || 250),
  // DEMO_PACE_MS=300 slows cache hits so a cached demo run unfolds at a watchable speed (0 = off).
  DEMO_PACE_MS: Number(process.env.DEMO_PACE_MS || 0),
  // Handwritten script photos (feature flag, off by default). Off = the app behaves exactly as before.
  FEATURE_HANDWRITING: ["1", "true"].includes(String(process.env.FEATURE_HANDWRITING || "").toLowerCase()),
  GEMINI_VISION_MODEL: process.env.GEMINI_VISION_MODEL || "gemini-3.5-flash-lite",
  GROQ_VISION_MODEL: process.env.GROQ_VISION_MODEL || "qwen/qwen3.8-27b",
  // Flag a transcription for the teacher above this share of [illegible] words, or this much disagreement between the two readings.
  HANDWRITING_ILLEGIBLE_MAX: Number(process.env.HANDWRITING_ILLEGIBLE_MAX || 0.15),
  HANDWRITING_DISAGREE_MAX: Number(process.env.HANDWRITING_DISAGREE_MAX || 0.2),
};
