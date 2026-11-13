// Phase 4: model client (cache, retry, fallback, repair), runs surviving a restart, and the error sweep.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { Mark, Task } from "@colleague/shared";
import { createLLM } from "../llm.js";
import { createRunStore } from "../runStore.js";
import { approveRun, diagnoseInCode, runColleague } from "../orchestrator.js";
import { plan, recalibrate } from "../agents/planner.js";

const tmp = () => mkdtempSync(join(tmpdir(), "colleague-test-"));
const Pong = z.object({ ok: z.boolean() });
const msgs = [{ role: "user", content: "ping" }];

// ---------- llm.js ----------
test("llm: second identical request is served from the disk cache", async () => {
  const dir = tmp();
  let calls = 0;
  const llm = createLLM({ cacheDir: dir, transport: { groq: async () => { calls++; return '{"ok":true}'; } } });
  assert.deepEqual(await llm.json(msgs, { schema: Pong }), { ok: true });
  assert.deepEqual(await llm.json(msgs, { schema: Pong }), { ok: true });
  assert.equal(calls, 1);
  assert.equal(llm.stats.cacheHits, 1);
  await llm.json(msgs, { schema: Pong, temperature: 0.9 });
  assert.equal(calls, 2, "a different request is not a cache hit");
  // A fresh client (new process) reads the same cache.
  const again = createLLM({ cacheDir: dir, transport: { groq: async () => { throw new Error("should not call"); } } });
  assert.deepEqual(await again.json(msgs, { schema: Pong }), { ok: true });
  rmSync(dir, { recursive: true, force: true });
});

test("llm: invalid JSON gets one repair turn; code fences are tolerated", async () => {
  const dir = tmp();
  const replies = ['{"ok": "yes"}', '```json\n{"ok": true}\n```'];
  const seen = [];
  const llm = createLLM({ cacheDir: dir, transport: { groq: async (body) => { seen.push(body.messages); return replies.shift(); } } });
  assert.deepEqual(await llm.json(msgs, { schema: Pong }), { ok: true });
  assert.equal(llm.stats.repairs, 1);
  assert.match(seen[1].at(-1).content, /Your JSON was invalid: ok:/);
  rmSync(dir, { recursive: true, force: true });
});

test("llm: 429s are retried with backoff, then Gemini takes over", async () => {
  const dir = tmp();
  let groqCalls = 0;
  const rateLimited = Object.assign(new Error("rate limited"), { status: 429, headers: {} });
  const llm = createLLM({
    cacheDir: dir, retryBaseMs: 1,
    transport: { groq: async () => { groqCalls++; throw rateLimited; }, gemini: async (body) => { assert.equal(body.response_format, undefined); return '{"ok":true}'; } },
  });
  assert.deepEqual(await llm.json(msgs, { schema: Pong }), { ok: true });
  assert.equal(groqCalls, 3, "3 tries on Groq");
  assert.equal(llm.stats.retries429, 2);
  assert.equal(llm.stats.fallbacks, 1);
  rmSync(dir, { recursive: true, force: true });
});

test("llm: a non-retryable error goes straight to the fallback; no provider → clear error", async () => {
  const dir = tmp();
  let groqCalls = 0;
  const llm = createLLM({ cacheDir: dir, retryBaseMs: 1, transport: { groq: async () => { groqCalls++; throw Object.assign(new Error("bad request"), { status: 400 }); }, gemini: async () => '{"ok":true}' } });
  await llm.json(msgs, { schema: Pong, cache: false });
  assert.equal(groqCalls, 1);
  const none = createLLM({ cacheDir: dir, transport: {} });
  await assert.rejects(none.json([{ role: "user", content: "new" }], { schema: Pong }), /No model provider configured/);
  rmSync(dir, { recursive: true, force: true });
});

// ---------- shared stubs ----------
const rubric = { criteria: ["argument", "structure"].map((name) => ({ name, max_score: 20 })) };
const noLLM = { json: async () => { throw new Error("model should not be called"); } };
const markScript = async ({ scriptId, rubric: r, attempt }) => {
  const s = Number(scriptId.slice(-1)) % 2 ? 6 : 15;
  return Mark.parse({ script_id: scriptId, scores: r.criteria.map((c) => ({ criterion: c.name, score: s, max_score: c.max_score, evidence: "Essay", reason: "r" })), total_pct: (s / 20) * 100, feedback: "f", attempt });
};
const buildTask = async ({ diagnosis, attempt }) => Task.parse({ learner_id: diagnosis.learner_id, gap: diagnosis.root_gap, attempt, instructions: "Do it.", questions: ["a", "b", "c"], answer_key: ["1", "2", "3"] });
const checkTask = async ({ task }) => ({ script_id: task.learner_id, verdict: "accept", reasons: [] });
const accepting = async ({ marks }) => ({ reviews: Object.keys(marks).map((id) => ({ script_id: id, verdict: "accept", reasons: [] })), drift: { flag: false, reason: "" } });
const sendAll = async (run, { excluded = [] }) => Object.values(run.learners).map((l) => ({ learner_id: l.learner_id, to: l.email, subject: "s", html: "", status: excluded.includes(l.learner_id) ? "skipped" : "sent" }));
const diagnose = async ({ marks }) => diagnoseInCode(marks, { pass_mark: 50, borderline: [40, 55] });
const brief = async () => "# Brief\n";
const agents = (extra = {}) => ({ plan, recalibrate, markScript, reviewBatch: accepting, diagnose, buildTask, checkTask, brief, sendAll, marksXlsx: null, ...extra });

function seed(store, n = 6) {
  const ids = Array.from({ length: n }, (_, i) => `L${String(i + 1).padStart(3, "0")}`);
  return store.create({
    goal: "g", rubric, anchors: {},
    scripts: Object.fromEntries(ids.map((id) => [id, `Essay ${id}`])),
    learners: Object.fromEntries(ids.map((id) => [id, { learner_id: id, name: id, grade: 10, email: `${id}@example.test` }])),
  });
}

// ---------- restart ----------
test("runs survive a restart: latest is reloaded, in-flight runs are marked interrupted, a gated run can still be approved", async () => {
  const dir = tmp();
  const before = createRunStore({ dir });
  const interrupted = seed(before);
  before.setStatus(interrupted.id, "marking");
  await before.flush(interrupted.id);
  await new Promise((r) => setTimeout(r, 5)); // distinct created_at
  const gated = seed(before);
  await runColleague(gated.id, { store: before, llm: noLLM, agents: agents() });
  assert.equal(gated.status, "awaiting_approval");

  const after = createRunStore({ dir, load: true });
  assert.equal(after.latest().id, gated.id);
  assert.equal(after.get(interrupted.id).status, "error");
  assert.match(after.get(interrupted.id).log.at(-2).message, /server restarted/i);
  const reloaded = after.get(gated.id);
  assert.equal(reloaded.log.length, gated.log.length, "the full event log is reloaded, so SSE replays it");
  assert.ok(reloaded.brief);

  const { delivery } = approveRun(gated.id, { excluded: ["L002"] }, { store: after, llm: noLLM, agents: agents() });
  await delivery;
  assert.equal(after.get(gated.id).status, "done");
  rmSync(dir, { recursive: true, force: true });
});

// ---------- error sweep ----------
test("a Reviewer that keeps failing doesn't end the run: its batch goes to the teacher", async () => {
  const store = createRunStore({ persist: false });
  const run = seed(store, 7);
  let calls = 0;
  const flakyReview = async (input, ctx) => { calls++; if (input.marks.L001) throw new Error("model timeout"); return accepting(input, ctx); };
  await runColleague(run.id, { store, llm: noLLM, agents: agents({ reviewBatch: flakyReview }) });
  assert.equal(run.status, "awaiting_approval");
  for (const id of ["L001", "L002", "L003", "L004", "L005"]) assert.equal(run.marks[id].status, "needs_teacher", id);
  assert.equal(run.marks.L006.status, "ok", "the next batch is reviewed normally");
  assert.equal(calls, 3, "batch 1 tried twice, batch 2 once");
});

test("Diagnostician and brief failures fall back to computed versions; the run still reaches the teacher", async () => {
  const store = createRunStore({ persist: false });
  const run = seed(store);
  const llm = { json: async () => { throw new Error("rate limited"); } };
  const realishBrief = async ({ run: r }, ctx) => { if (ctx.llm) await ctx.llm.json([], {}); return `# Class assessment brief\n- Scripts marked: ${Object.keys(r.marks).length}\n`; };
  await runColleague(run.id, { store, llm, agents: agents({ diagnose: async () => { throw new Error("bad JSON twice"); }, brief: realishBrief }) });

  assert.equal(run.status, "awaiting_approval");
  assert.equal(Object.keys(run.diagnoses).length, 6);
  assert.equal(run.diagnoses.L001.severity, "needs_help");
  assert.equal(run.diagnoses.L001.root_gap, "argument");
  assert.equal(Object.keys(run.tasks).length, 3, "struggling learners still get tasks");
  assert.match(run.brief, /Scripts marked: 6/);
  assert.ok(run.log.some((e) => e.kind === "error" && /Diagnostician failed/.test(e.message)));
  assert.ok(run.log.some((e) => e.kind === "error" && /Brief summary failed/.test(e.message)));
});

test("delivery steps are independent: a failed spreadsheet doesn't stop the emails", async () => {
  const dir = tmp();
  const store = createRunStore({ dir });
  const run = seed(store, 3);
  const deps = { store, llm: noLLM, agents: agents({ marksXlsx: async () => { throw new Error("disk full"); } }) };
  await runColleague(run.id, deps);
  await approveRun(run.id, {}, deps).delivery;
  assert.equal(run.status, "done");
  assert.ok(run.log.some((e) => e.kind === "error" && /marks.xlsx failed \(disk full\)/.test(e.message)));
  assert.equal(run.outbox.filter((m) => m.status === "sent").length, 3);
  rmSync(dir, { recursive: true, force: true });
});

test("results are stored in learner order however parallel work finishes (repeatable runs and cache keys)", async () => {
  const store = createRunStore({ persist: false });
  const run = seed(store, 6);
  const slowFirst = async (input, ctx) => {
    await new Promise((r) => setTimeout(r, input.scriptId === "L001" ? 30 : 1));
    return markScript(input, ctx);
  };
  await runColleague(run.id, { store, llm: noLLM, agents: agents({ markScript: slowFirst }) });
  assert.deepEqual(Object.keys(run.marks), ["L001", "L002", "L003", "L004", "L005", "L006"]);
  assert.deepEqual(Object.keys(run.diagnoses), ["L001", "L002", "L003", "L004", "L005", "L006"]);
  assert.deepEqual(Object.keys(run.tasks), ["L001", "L003", "L005"]);
});
