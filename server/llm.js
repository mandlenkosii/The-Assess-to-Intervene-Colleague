// The ONLY place that talks to model providers.
// Flow: disk cache → Groq (JSON mode) → 429/5xx backoff ×3 → Gemini fallback → parse + Zod validate
//       → one "fix your JSON" repair turn → throw.
import OpenAI from "openai";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { env, ROOT } from "./env.js";

export const CACHE_DIR = join(ROOT, ".cache");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Default transport: the real providers through their OpenAI-compatible APIs.
// A transport is { groq?, gemini? }, each (body) => Promise<string>; errors carry .status/.headers like the SDK's.
function openAITransport() {
  const client = (apiKey, baseURL) => new OpenAI({ apiKey, baseURL, maxRetries: 0, timeout: env.LLM_TIMEOUT_MS });
  const call = (c) => async (body) => (await c.chat.completions.create(body)).choices[0]?.message?.content ?? "";
  return {
    groq: env.GROQ_API_KEY ? call(client(env.GROQ_API_KEY, "https://api.groq.com/openai/v1")) : null,
    gemini: env.GEMINI_API_KEY ? call(client(env.GEMINI_API_KEY, "https://generativelanguage.googleapis.com/v1beta/openai/")) : null,
  };
}

/**
 * @param {{ log?: Function, transport?: {groq?: Function, gemini?: Function}, cacheDir?: string, retryBaseMs?: number }} [opts]
 *   transport/cacheDir/retryBaseMs are for tests and rehearsals; the app uses the defaults.
 */
export function createLLM({ log = () => {}, transport = openAITransport(), cacheDir = CACHE_DIR, retryBaseMs = 1000, label, primary = env.LLM_PRIMARY } = {}) {
  const groq = transport.groq ?? null;
  const gemini = transport.gemini ?? null;
  // LLM_PRIMARY picks who answers first; the other provider is the fallback.
  const order = primary === "groq" ? ["groq", "gemini"] : ["gemini", "groq"];
  const send = { groq, gemini };
  const modelFor = (name, tier) => name === "gemini" ? env.GEMINI_MODEL : tier === "small" ? env.GROQ_MODEL_SMALL : env.GROQ_MODEL_LARGE;
  const lead = order.find((name) => send[name]) ?? order[0];
  if (!groq && !gemini) log("llm: no GROQ_API_KEY or GEMINI_API_KEY set; only cached responses will work");

  const stats = { calls: 0, cacheHits: 0, fallbacks: 0, repairs: 0, retries429: 0, ms: 0 };

  async function callProvider(name, send, model, messages, temperature, maxTokens) {
    const body = { model, messages, temperature, max_tokens: maxTokens };
    if (name === "groq") body.response_format = { type: "json_object" };
    // gpt-oss reasoning tokens count against Groq's free 8k tokens/minute; low effort keeps a mark to one call's worth.
    if (/gpt-oss/.test(model)) body.reasoning_effort = "low";
    for (let attempt = 0; ; attempt++) {
      try {
        const t0 = Date.now();
        const content = await send(body);
        stats.calls++;
        stats.ms += Date.now() - t0;
        return content;
      } catch (err) {
        const status = err?.status;
        const retryable = status === 429 || (status >= 500 && status < 600) || err?.name === "APIConnectionError";
        if (!retryable || attempt >= 2) throw err;
        if (status === 429) stats.retries429++;
        const header = Number(err?.headers?.["retry-after"]);
        const wait = Number.isFinite(header) && header > 0 ? Math.min(header * 1000, 15000) : retryBaseMs * 2 ** attempt;
        log(`llm: ${name} ${status ?? "network"} – retrying in ${wait}ms`);
        await sleep(wait);
      }
    }
  }

  async function complete(messages, tier, temperature, maxTokens) {
    let lastErr;
    let tried = 0;
    for (const name of order) {
      if (!send[name]) continue;
      if (tried++) stats.fallbacks++;
      try {
        return await callProvider(name, send[name], modelFor(name, tier), messages, temperature, maxTokens);
      } catch (err) {
        lastErr = err;
        const next = order.find((n) => n !== name && send[n]);
        log(`llm: ${name} failed (${err?.status ?? err?.message})${next && tried === 1 ? `; falling back to ${next}` : ""}`);
      }
    }
    throw lastErr ?? new Error("No model provider configured (set GROQ_API_KEY or GEMINI_API_KEY in .env)");
  }

  /**
   * Ask for a JSON object and validate it.
   * @param {Array<{role:string, content:string}>} messages
   * @param {{schema: import('zod').ZodTypeAny, tier?: 'large'|'small', temperature?: number, maxTokens?: number, cache?: boolean}} opts
   */
  async function json(messages, { schema, tier = "large", temperature = 0.2, maxTokens = 2048, cache = true } = {}) {
    if (!schema) throw new Error("llm.json needs a Zod schema");
    const msgs = withJsonInstruction(messages);
    // Key on the *primary* model so a Gemini-fallback answer is reused on the next run too.
    const model = modelFor(lead, tier);
    const key = createHash("sha256").update(JSON.stringify({ model, msgs, temperature })).digest("hex");
    const file = join(cacheDir, `${key}.json`);

    if (cache && !env.NO_CACHE) {
      try {
        const hit = schema.safeParse(JSON.parse(await readFile(file, "utf8")));
        if (hit.success) {
          stats.cacheHits++;
          // Demo pacing: a cached run would finish in under a second; pause so the audience can watch it work.
          if (env.DEMO_PACE_MS > 0) await sleep(env.DEMO_PACE_MS);
          return hit.data;
        }
      } catch { /* miss */ }
    }

    let raw = await complete(msgs, tier, temperature, maxTokens);
    let result = validate(raw, schema);
    if (!result.ok) {
      stats.repairs++;
      log(`llm: invalid JSON, asking for a repair (${result.error.slice(0, 120)})`);
      raw = await complete(
        [...msgs, { role: "assistant", content: raw }, { role: "user", content: `Your JSON was invalid: ${result.error}. Return ONLY the corrected JSON object, nothing else.` }],
        tier, 0, maxTokens,
      );
      result = validate(raw, schema);
      if (!result.ok) throw new Error(`Model returned invalid JSON after repair: ${result.error}`);
    }

    if (cache) {
      await mkdir(cacheDir, { recursive: true });
      await writeFile(file, JSON.stringify(result.data));
    }
    return result.data;
  }

  // label records which model produced a run, so rehearsal numbers are never mistaken for real ones.
  label ??= send[lead] ? `${lead}:${modelFor(lead, "large")}` : "none";
  return { json, stats, label };
}

function withJsonInstruction(messages) {
  const note = "Respond with a single valid JSON object only. No markdown, no code fences, no commentary.";
  const [first, ...rest] = messages;
  if (first?.role === "system") return [{ role: "system", content: `${first.content}\n\n${note}` }, ...rest];
  return [{ role: "system", content: note }, ...messages];
}

function validate(raw, schema) {
  let obj;
  try {
    obj = JSON.parse(extractJson(raw));
  } catch (e) {
    return { ok: false, error: `not parseable JSON (${e.message})` };
  }
  const r = schema.safeParse(obj);
  if (r.success) return { ok: true, data: r.data };
  const error = r.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
  return { ok: false, error };
}

function extractJson(raw) {
  const s = String(raw).trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  if (s.startsWith("{") || s.startsWith("[")) return s;
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  return start >= 0 && end > start ? s.slice(start, end + 1) : s;
}
