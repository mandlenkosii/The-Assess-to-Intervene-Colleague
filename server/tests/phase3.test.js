// Phase 3: Loop 2 (tasks), the approval gate, delivery, and a full end-to-end run with every real agent
// and the deterministic fake model. No API keys, no network, no email is sent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LogEvent, Mark, Task } from "@colleague/shared";
import { plan, recalibrate } from "../agents/planner.js";
import { approveRun, MAX_TASK_ATTEMPTS, runColleague } from "../orchestrator.js";
import { createRunStore } from "../runStore.js";
import { createApp } from "../app.js";
import { loadDemoInputs } from "../inputs.js";
import { createFakeLLM } from "../scripts/fakeLLM.js";

const rubric = { criteria: ["argument", "structure"].map((name) => ({ name, max_score: 20 })) };
const noLLM = { json: async () => { throw new Error("model should not be called"); } };

// Records what delivery would send instead of sending it.
function stubSendAll(calls = []) {
  return async (run, { excluded = [], ctx } = {}) => {
    calls.push({ excluded });
    const outbox = Object.values(run.learners).map((l) => ({
      learner_id: l.learner_id, to: l.email, subject: "Feedback", html: "<p>hi</p>",
      status: excluded.includes(l.learner_id) ? "skipped" : "sent",
    }));
    for (const m of outbox) await ctx?.emit?.({ stage: "deliver", agent: "delivery", kind: "email", ref: m.learner_id, message: `Email ${m.status}`, data: { status: m.status } });
    return outbox;
  };
}

function seed(n = 4) {
  const store = createRunStore({ persist: false });
  const ids = Array.from({ length: n }, (_, i) => `L${String(i + 1).padStart(3, "0")}`);
  const run = store.create({
    goal: "Mark and support", rubric, anchors: {},
    scripts: Object.fromEntries(ids.map((id) => [id, `Essay ${id}`])),
    learners: Object.fromEntries(ids.map((id) => [id, { learner_id: id, name: id, grade: 10, email: `${id}@example.test` }])),
  });
  return { store, run, ids };
}

// Minimal agents: everyone below 50% needs help; Builder/Checker behaviour is scripted per test.
const markScript = async ({ scriptId, rubric: r, attempt }, ctx) => {
  const s = scriptId === "L001" || scriptId === "L002" ? 6 : 15;
  const scores = r.criteria.map((c) => ({ criterion: c.name, score: s, max_score: c.max_score, evidence: "Essay", reason: "r" }));
  return Mark.parse({ script_id: scriptId, scores, total_pct: (s / 20) * 100, feedback: "f", attempt });
};
const diagnose = async ({ marks }) => ({
  diagnoses: marks.map((m) => ({ learner_id: m.script_id, root_gap: "structure", severity: m.total_pct < 50 ? "needs_help" : "on_track", evidence: [] })),
  classGaps: [{ criterion: "structure", average_pct: 50 }],
});
const buildTask = async ({ diagnosis, attempt }) => Task.parse({
  learner_id: diagnosis.learner_id, gap: diagnosis.root_gap, attempt,
  instructions: "Do it.", questions: ["a", "b", "c"], answer_key: ["1", "2", "3"],
});
const brief = async ({ run }) => `# Brief\n- Scripts marked: ${Object.keys(run.marks).length}\n`;

const agentsWith = (extra) => ({ plan, recalibrate, markScript, reviewBatch: null, diagnose, buildTask, brief, ...extra });

test("Loop 2: a rejected task goes back to the Builder with the reasons; run stops at awaiting_approval", async () => {
  const { store, run } = seed();
  const builderCalls = [];
  const checkTask = async ({ task }) => ({
    script_id: task.learner_id,
    verdict: task.learner_id === "L001" && task.attempt === 1 ? "reject" : "accept",
    reasons: task.learner_id === "L001" && task.attempt === 1 ? ["Task gap does not match the diagnosed root gap."] : [],
  });
  const tracked = async (input, ctx) => { builderCalls.push(input); return buildTask(input, ctx); };
  const sendCalls = [];
  await runColleague(run.id, { store, llm: noLLM, agents: agentsWith({ buildTask: tracked, checkTask, sendAll: stubSendAll(sendCalls) }) });

  assert.equal(run.status, "awaiting_approval");
  assert.deepEqual(Object.keys(run.tasks).sort(), ["L001", "L002"], "only struggling learners get tasks");
  assert.equal(run.tasks.L001.attempt, 2);
  assert.equal(builderCalls.find((c) => c.diagnosis.learner_id === "L001" && c.attempt === 2).feedback, "Task gap does not match the diagnosed root gap.");
  const fixes = run.log.filter((e) => e.kind === "correction" && e.ref === "L001");
  assert.deepEqual(fixes.map((e) => [e.agent, e.data.route, e.data.after]), [["checker", "builder", null], ["checker", "builder", "structure"]]);
  assert.match(run.brief, /Scripts marked: 4/);
  assert.ok(run.log.some((e) => e.data?.brief), "brief is sent to the UI");
  assert.equal(sendCalls.length, 0, "nothing is sent before approval");
  assert.equal(run.approved, false);
});

test("Loop 2 limit: a task rejected every time is flagged needs teacher; a Builder crash counts as a rejection", async () => {
  const { store, run } = seed();
  let crashed = false;
  const flaky = async (input, ctx) => {
    if (input.diagnosis.learner_id === "L002" && !crashed) { crashed = true; throw new Error("Generated practice task must contain 3–5 questions"); }
    return buildTask(input, ctx);
  };
  const checkTask = async ({ task }) => ({ script_id: task.learner_id, verdict: task.learner_id === "L001" ? "reject" : "accept", reasons: ["Too hard for Grade 10"] });
  await runColleague(run.id, { store, llm: noLLM, agents: agentsWith({ buildTask: flaky, checkTask }) });

  assert.equal(run.status, "awaiting_approval");
  assert.equal(run.tasks.L001.status, "needs_teacher");
  assert.equal(run.tasks.L001.attempt, MAX_TASK_ATTEMPTS);
  assert.equal(run.tasks.L002.attempt, 2, "crash on attempt 1, rebuilt on attempt 2");
  assert.ok(run.log.some((e) => e.ref === "L002" && /must contain 3–5 questions/.test(e.message)));
});

test("approval gate: only while awaiting approval, once; exclusions reach delivery; run ends done", async () => {
  const { store, run } = seed();
  const sendCalls = [];
  const deps = { store, llm: noLLM, agents: agentsWith({ checkTask: async ({ task }) => ({ script_id: task.learner_id, verdict: "accept", reasons: [] }), sendAll: stubSendAll(sendCalls), marksXlsx: null }) };

  const early = store.create({ goal: "g", rubric, scripts: { L1: "x" }, learners: {} });
  assert.throws(() => approveRun(early.id, {}, deps), /not waiting for approval/);

  await runColleague(run.id, deps);
  assert.equal(run.status, "awaiting_approval");
  const { delivery } = approveRun(run.id, { excluded: ["L002", "NOT_A_LEARNER"] }, deps);
  assert.throws(() => approveRun(run.id, {}, deps), /already been approved/);
  await delivery;

  assert.equal(run.status, "done");
  assert.equal(run.approved, true);
  assert.deepEqual(run.excluded, ["L002"], "unknown ids are dropped");
  assert.deepEqual(sendCalls, [{ excluded: ["L002"] }]);
  assert.equal(run.outbox.find((m) => m.learner_id === "L002").status, "skipped");
  const last = run.log.filter((e) => e.kind === "log").at(-1);
  assert.match(last.message, /3 sent, 0 failed, 1 skipped/);
  assert.ok(Array.isArray(last.data.outbox), "the full outbox is sent to the UI");
});

test("POST /api/runs/:id/approve: 409 before the gate, 202 at the gate, then SSE reaches done", async () => {
  const store = createRunStore({ persist: false });
  const agents = agentsWith({ checkTask: async ({ task }) => ({ script_id: task.learner_id, verdict: "accept", reasons: [] }), sendAll: stubSendAll(), marksXlsx: null });
  const { app } = createApp({ store, llm: noLLM, agents });
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const { run } = seed();
    // Same inputs, but created in the app's own store.
    const live = store.create({ goal: run.goal, rubric, anchors: {}, scripts: run.scripts, learners: run.learners });
    const post = (body) => fetch(`${base}/api/runs/${live.id}/approve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

    const tooEarly = await post({ approved: true });
    assert.equal(tooEarly.status, 409);

    await runColleague(live.id, { store, llm: noLLM, agents });
    assert.equal(live.status, "awaiting_approval");
    assert.equal((await post({ approved: false })).status, 400);
    const ok = await post({ approved: true, excluded: ["L003"] });
    assert.equal(ok.status, 202);
    assert.deepEqual((await ok.json()).excluded, ["L003"]);
    assert.equal((await post({ approved: true })).status, 409, "can't approve twice");

    for (let i = 0; i < 50 && live.status !== "done"; i++) await new Promise((r) => setTimeout(r, 10));
    assert.equal(live.status, "done");
  } finally { server.closeAllConnections?.(); server.close(); }
});

test("end to end with every real agent and the fake model: both loops fire, gate holds, delivery completes", async () => {
  const store = createRunStore({ persist: false });
  const run = store.create(await loadDemoInputs());
  const llm = createFakeLLM();
  const sendCalls = [];
  await runColleague(run.id, { store, llm, agents: { sendAll: stubSendAll(sendCalls), marksXlsx: null } });

  assert.equal(run.status, "awaiting_approval");
  assert.equal(Object.keys(run.marks).length, 30);
  assert.equal(run.marks.L024.attempt > 1, true, "off-topic trap was re-marked");
  assert.ok(run.marks.L024.total_pct < 60, "and its mark came down");
  assert.ok(run.log.some((e) => e.kind === "correction" && e.data?.route === "builder"), "Loop 2 sent a task back");
  assert.ok(Object.values(run.tasks).length > 0);
  assert.ok(run.brief?.includes("Class assessment brief"));
  assert.equal(sendCalls.length, 0);
  for (const ev of run.log) assert.ok(LogEvent.safeParse(ev).success, `invalid: ${JSON.stringify(ev).slice(0, 200)}`);

  const { delivery } = approveRun(run.id, {}, { store, llm, agents: { sendAll: stubSendAll(sendCalls), marksXlsx: null } });
  await delivery;
  assert.equal(run.status, "done");
  assert.equal(sendCalls.length, 1);
});
