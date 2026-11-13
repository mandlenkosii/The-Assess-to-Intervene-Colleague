// Spine (phase 1): planner, orchestrator thin slice, run store, HTTP + SSE. No API keys needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LogEvent, Mark } from "@colleague/shared";
import { plan } from "../agents/planner.js";
import { runColleague } from "../orchestrator.js";
import { createRunStore } from "../runStore.js";
import { createApp } from "../app.js";
import { keyByLearner, learnersFromCsv, parseCsv } from "../inputs.js";

const rubric = {
  pass_mark: 50,
  borderline_band: [40, 55],
  criteria: ["argument", "evidence", "structure"].map((name) => ({ name, max_score: 20, descriptors: { "16-20": "Strong." } })),
};
const noLLM = { json: async () => { throw new Error("model should not be called"); }, stats: {} };

const stubMarker = async ({ scriptId, text, rubric: r }, ctx) => {
  const scores = r.criteria.map((c) => ({ criterion: c.name, score: 10, max_score: c.max_score, evidence: text.slice(0, 20), reason: "ok" }));
  const mark = Mark.parse({ script_id: scriptId, scores, total_pct: 50, feedback: "Good start." });
  ctx.emit({ stage: "act", agent: "marker", kind: "mark", ref: scriptId, message: `Marked ${scriptId}: 50%`, data: { mark } });
  return mark;
};

function seedRun(store, n = 12) {
  const learners = Object.fromEntries(Array.from({ length: n }, (_, i) => {
    const id = `L${String(i + 1).padStart(3, "0")}`;
    return [id, { learner_id: id, name: `Learner ${i + 1}`, grade: 10, email: "TEAM_INBOX_1" }];
  }));
  const scripts = Object.fromEntries(Object.keys(learners).map((id) => [id, `Essay by ${id} about cellphones in class.`]));
  return store.create({ goal: "Mark this class", rubric, anchors: { weak: { script_id: "a", text: "x", scores: [], total_pct: 30 } }, scripts, learners });
}

test("planner batches in fives, reads pass mark and band, no model call for a structured rubric", async () => {
  const events = [];
  const ids = Array.from({ length: 12 }, (_, i) => `L${i}`);
  const p = await plan({ goal: "g", rubric, scriptIds: ids, anchorCount: 3 }, { llm: noLLM, emit: (e) => events.push(e) });
  assert.deepEqual(p.batches.map((b) => b.length), [5, 5, 2]);
  assert.equal(p.pass_mark, 50);
  assert.deepEqual(p.borderline, [40, 55]);
  assert.equal(p.criteria.length, 3);
  assert.ok(events.every((e) => e.stage === "plan" && e.agent === "planner"));
  assert.ok(events.some((e) => e.data?.plan?.batches === 3));
});

test("planner uses one model call to read a free-form rubric", async () => {
  let calls = 0;
  const llm = { json: async (_m, { schema }) => { calls++; return schema.parse({ criteria: [{ name: "argument", max_score: 10 }] }); } };
  const p = await plan({ rubric: "Argument out of 10 marks", scriptIds: ["a"] }, { llm, emit: () => {} });
  assert.equal(calls, 1);
  assert.equal(p.criteria[0].name, "argument");
});

test("orchestrator thin slice: plan → mark first script → done, every event valid", async () => {
  const store = createRunStore({ persist: false });
  const run = seedRun(store);
  await runColleague(run.id, { store, llm: noLLM, agents: { plan, markScript: stubMarker } });

  assert.equal(run.status, "done");
  assert.ok(run.plan);
  assert.deepEqual(Object.keys(run.marks), ["L001"]);
  for (const ev of run.log) assert.ok(LogEvent.safeParse(ev).success, `invalid event: ${JSON.stringify(ev)}`);
  const stages = [...new Set(run.log.map((e) => e.stage))];
  assert.deepEqual(stages, ["goal", "plan", "act"]);
});

test("orchestrator stops cleanly after planning when no Marker exists", async () => {
  const store = createRunStore({ persist: false });
  const run = seedRun(store, 3);
  await runColleague(run.id, { store, llm: noLLM, agents: { plan, markScript: null } });
  assert.equal(run.status, "done");
  assert.ok(run.log.some((e) => e.kind === "error" && /Marker/.test(e.message)));
});

test("orchestrator turns an agent crash into status error, never a thrown promise", async () => {
  const store = createRunStore({ persist: false });
  const run = seedRun(store, 3);
  const boom = async () => { throw new Error("model exploded"); };
  await runColleague(run.id, { store, llm: noLLM, agents: { plan, markScript: boom } });
  assert.equal(run.status, "error");
  assert.ok(run.log.some((e) => /model exploded/.test(e.message)));
});

test("csv parsing and script → learner pairing", () => {
  const rows = parseCsv('learner_id,name,grade,email\nL001,"Nkosi, Amara",10,a@x\r\nL002,Thabo,10,b@x\n');
  assert.equal(rows[0].name, "Nkosi, Amara");
  const learners = learnersFromCsv("learner_id,name,grade,email\nL001,A,10,a\nL002,B,10,b\n");
  const { scripts, source_ids } = keyByLearner([{ id: "script_01", text: "one" }, { id: "L002", text: "two" }], learners);
  assert.deepEqual(scripts, { L001: "one", L002: "two" });
  assert.equal(source_ids.L001, "script_01");
});

// ---- HTTP + SSE ----
async function withServer(fn) {
  const store = createRunStore({ persist: false });
  const { app } = createApp({ store, llm: noLLM, agents: { plan, markScript: stubMarker } });
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base, store); } finally { server.closeAllConnections?.(); server.close(); }
}

async function readSse(url, { until, headers = {} }) {
  const res = await fetch(url, { headers });
  assert.equal(res.headers.get("content-type"), "text/event-stream");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const events = [];
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      const id = chunk.match(/^id: (\d+)/m)?.[1];
      const data = chunk.match(/^data: (.*)$/m)?.[1];
      if (data) events.push({ id: Number(id), ...JSON.parse(data) });
    }
    if (events.some(until)) { await reader.cancel(); break; }
  }
  return events;
}

test("POST /api/runs (upload) → SSE streams the run to done; snapshot and resume work", async () => {
  await withServer(async (base) => {
    const form = new FormData();
    form.append("goal", "Mark this class set");
    form.append("rubric", new Blob([JSON.stringify(rubric)]), "rubric.json");
    form.append("learners", new Blob(["learner_id,name,grade,email\nL001,A,10,a\nL002,B,10,b\n"]), "learners.csv");
    form.append("scripts", new Blob(["First essay text here."]), "L001.txt");
    form.append("scripts", new Blob(["Second essay text here."]), "L002.txt");

    const res = await fetch(`${base}/api/runs`, { method: "POST", body: form });
    assert.equal(res.status, 201);
    const { runId } = await res.json();

    const isDone = (e) => e.kind === "status" && ["done", "error"].includes(e.data?.status);
    const events = await readSse(`${base}/api/runs/${runId}/events`, { until: isDone });
    assert.equal(events.at(-1).data.status, "done");
    assert.ok(events.some((e) => e.kind === "mark" && e.ref === "L001"));
    assert.deepEqual(events.map((e) => e.id), events.map((_, i) => i), "ids are sequential from 0");

    const snap = await (await fetch(`${base}/api/runs/${runId}`)).json();
    assert.equal(snap.status, "done");
    assert.equal(snap.script_count, 2);
    assert.equal(snap.scripts, undefined, "snapshot omits script texts");

    // Reconnect with Last-Event-ID: only later events are replayed.
    const resumed = await readSse(`${base}/api/runs/${runId}/events`, { until: isDone, headers: { "Last-Event-ID": String(events.length - 3) } });
    assert.equal(resumed.length, 2);
    assert.equal(resumed[0].id, events.length - 2);
  });
});

test("upload validation and unknown runs return clear JSON errors", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/runs`, { method: "POST", body: new FormData() });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /rubric/i);
    const missing = await fetch(`${base}/api/runs/nope`);
    assert.equal(missing.status, 404);
  });
});
