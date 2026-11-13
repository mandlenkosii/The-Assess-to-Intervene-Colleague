// Deterministic stand-in for Groq/Gemini so the whole pipeline can run without API keys or rate limits
// (npm run smoke -- --fake, and the end-to-end test). It answers each agent's prompt in that agent's shape
// and plants the mistakes the review loops are meant to catch:
//   - Marker over-rewards the long off-topic essay on its first attempt, with an invented quote → Loop 1
//   - Checker rejects some first-attempt tasks as missing the diagnosed gap → Loop 2
import { createHash } from "node:crypto";

const hash = (s) => parseInt(createHash("sha1").update(String(s)).digest("hex").slice(0, 8), 16);
const sentences = (t) => String(t).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 15);
const words = (n) => Array.from({ length: n }, (_, i) =>
  ["Your", "essay", "takes", "a", "clear", "position", "on", "phones", "and", "supports", "it", "with", "examples"][i % 13]).join(" ") + ".";
const tryJson = (s) => { try { return JSON.parse(s); } catch { return null; } };

export function createFakeLLM({ latencyMs = 0 } = {}) {
  const stats = { calls: 0, cacheHits: 0, fallbacks: 0, repairs: 0, retries429: 0, ms: 0, byAgent: {} };
  const count = (agent) => { stats.calls++; stats.byAgent[agent] = (stats.byAgent[agent] ?? 0) + 1; };

  async function json(messages, { schema }) {
    if (latencyMs) await new Promise((r) => setTimeout(r, latencyMs));
    return schema.parse(answer(messages, count));
  }

  return { json, stats };
}

/**
 * The same fake as a provider transport for createLLM({ transport }), so the real cache / retry / repair code runs.
 * Returns raw JSON text, like a provider would.
 */
export function createFakeTransport({ latencyMs = 0, counts = {} } = {}) {
  const send = async (body) => {
    if (latencyMs) await new Promise((r) => setTimeout(r, latencyMs));
    return JSON.stringify(answer(body.messages, (agent) => { counts[agent] = (counts[agent] ?? 0) + 1; }));
  };
  return { groq: send, gemini: null, counts };
}

function answer(messages, count) {
  const system = messages.find((m) => m.role === "system")?.content ?? "";
  const user = messages.at(-1)?.content ?? "";
  const input = tryJson(user) ?? {};
  let out;

  if (input.script !== undefined && input.rubric) {
    const blind = /independent, strict marker/i.test(system);
    count(blind ? "blind" : "marker");
    out = mark(input, blind);
  } else if (/Severity \(computed in code\)/.test(user)) {
    count("diagnostician");
    const learner = user.match(/Learner: ([^,\n]+)/)?.[1] ?? "unknown";
    const gap = user.match(/Lowest criterion: (.+)/)?.[1]?.trim() ?? "structure";
    out = { learner_id: learner, root_gap: gap, severity: "needs_help", evidence: [] };
  } else if (/practice task/i.test(system) && /Diagnosis:/.test(user)) {
    count("builder");
    const gap = user.match(/"root_gap":"([^"]+)"/)?.[1] ?? "structure";
    out = {
      learner_id: "x", gap,
      instructions: `Read the paragraph below and practise ${gap} by answering each question in full sentences.`,
      questions: [`Explain what strong ${gap} looks like in an argument.`, `Rewrite one weak sentence to improve its ${gap}.`, `Write a short paragraph that shows good ${gap}.`],
      answer_key: ["A clear explanation with an example.", "A rewritten sentence that is clearer.", "A paragraph with a claim, a reason and an example."],
    };
  } else if (/Check that the task/i.test(system)) {
    count("checker");
    const task = tryJson(user.split("Task: ")[1] ?? "") ?? {};
    const reject = (task.attempt ?? 1) === 1 && hash(task.learner_id) % 2 === 0;
    out = {
      script_id: task.learner_id ?? "x",
      verdict: reject ? "reject" : "accept",
      reasons: reject ? ["Questions practise general writing, not the diagnosed gap"] : [],
    };
  } else if (input.scripts_marked !== undefined) {
    count("brief");
    out = { summary: `${input.scripts_marked} scripts were marked and checked; ${input.corrections_made} marks were corrected after review, and ${input.learners_needing_support} learners have a catch-up task.` };
  } else {
    count("other");
    out = { criteria: [{ name: "argument", max_score: 20 }], ok: true, subject: "fake", fact: "fake", summary: "fake" };
  }
  return out;
}

function mark(input, blind) {
  const text = input.script ?? "";
  const quote = sentences(text)[0] ?? text.slice(0, 40);
  const offTopic = /School uniforms/i.test(text);
  const reviewerFeedback = (input.reviewer_feedback_from_previous_attempt ?? []).some((f) => !String(f).startsWith("Calibration:"));
  // A spread of scores per script so batches don't look like middle-mark drift.
  const base = 6 + (hash(input.script_id) % 12);
  const scores = input.rubric.criteria.map((c, i) => {
    let score = Math.min(c.max_score, base + ((i * 3) % 5));
    let evidence = sentences(text)[i % Math.max(1, sentences(text).length)] ?? quote;
    if (offTopic) {
      if (!blind && !reviewerFeedback) {
        score = 17;
        if (c.name === "argument") evidence = "Cellphones are essential learning tools for every learner.";
      } else if (c.name === "argument" || c.name === "evidence") {
        score = 3;
      }
    }
    return { criterion: c.name, score, max_score: c.max_score, evidence, reason: "Matches the rubric descriptor." };
  });
  return blind ? { script_id: input.script_id, scores } : { script_id: input.script_id, scores, feedback: words(100) };
}
