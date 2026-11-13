// Loop 1 (phase 2): reject → re-mark, retry limit → needs teacher, drift → replan, concurrency, timeout.
// Stub Marker and Reviewer, so no API keys are needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LogEvent, Mark } from "@colleague/shared";
import { plan, recalibrate } from "../agents/planner.js";
import { MAX_ATTEMPTS, runColleague } from "../orchestrator.js";
import { createRunStore } from "../runStore.js";

const rubric = { criteria: ["argument", "evidence"].map((name) => ({ name, max_score: 20 })) };
const noLLM = { json: async () => { throw new Error("model should not be called"); } };

function seed(n = 7) {
  const store = createRunStore({ persist: false });
  const ids = Array.from({ length: n }, (_, i) => `L${String(i + 1).padStart(3, "0")}`);
  const run = store.create({
    goal: "Mark this class",
    rubric,
    anchors: { weak: { script_id: "anchor_weak", text: "weak", scores: [], total_pct: 30 } },
    scripts: Object.fromEntries(ids.map((id) => [id, `Essay ${id}`])),
    learners: {},
  });
  return { store, run, ids };
}

// Marker whose score for a script can depend on its attempt number and the feedback it receives.
function scriptedMarker(scoreFor = () => 10, { delayMs = 0, calls = [] } = {}) {
  return async ({ scriptId, rubric: r, attempt, feedback }, ctx) => {
    calls.push({ scriptId, attempt, feedback });
    if (delayMs) await new Promise((res) => setTimeout(res, delayMs));
    const s = scoreFor(scriptId, attempt, feedback);
    const scores = r.criteria.map((c) => ({ criterion: c.name, score: s, max_score: c.max_score, evidence: "Essay", reason: "r" }));
    const mark = Mark.parse({ script_id: scriptId, scores, total_pct: (s / 20) * 100, feedback: "f", attempt });
    ctx.emit({ stage: "act", agent: "marker", kind: "mark", ref: scriptId, message: `Marked ${scriptId}`, data: { mark } });
    return mark;
  };
}

// Reviewer that rejects by a rule; records every call.
function scriptedReviewer(rejectIf = () => false, { drift = () => false, calls = [] } = {}) {
  return async ({ marks, checkAnchors }, ctx) => {
    calls.push({ ids: Object.keys(marks), checkAnchors });
    const reviews = Object.values(marks).map((m) => {
      const reject = rejectIf(m);
      const review = { script_id: m.script_id, verdict: reject ? "reject" : "accept", reasons: reject ? ["no evidence quoted for evidence"] : [] };
      ctx.emit({ stage: "check", agent: "calibrator", kind: "review", ref: m.script_id, message: `${review.verdict} ${m.script_id}`, data: { review } });
      return review;
    });
    const flag = drift(marks, calls.length);
    return { reviews, drift: { flag, reason: flag ? "more than 60% of the batch in the middle band" : "" }, blindMarks: {} };
  };
}

const run1 = async (ctx, agents, opts = {}) =>
  runColleague(ctx.run.id, { store: ctx.store, llm: noLLM, agents: { plan, recalibrate, ...agents }, ...opts });

const corrections = (run) => run.log.filter((e) => e.kind === "correction");
const allValid = (run) => run.log.forEach((ev) => assert.ok(LogEvent.safeParse(ev).success, `invalid: ${JSON.stringify(ev)}`));

test("rejected mark goes back to the Marker with the reviewer's reasons and is corrected", async () => {
  const ctx = seed(7);
  const markerCalls = [];
  // L003 is over-marked on attempt 1 (18/20), fixed on attempt 2 (6/20).
  const markScript = scriptedMarker((id, attempt) => (id === "L003" && attempt === 1 ? 18 : 6 + (id === "L003" ? 0 : 4)), { calls: markerCalls });
  const reviewBatch = scriptedReviewer((m) => m.script_id === "L003" && m.attempt === 1);
  await run1(ctx, { markScript, reviewBatch });

  const { run } = ctx;
  assert.equal(run.status, "done");
  assert.equal(Object.keys(run.marks).length, 7);
  assert.equal(run.marks.L003.attempt, 2);
  assert.equal(run.marks.L003.total_pct, 30);
  assert.equal(run.marks.L003.status, "ok");
  const remark = markerCalls.find((c) => c.scriptId === "L003" && c.attempt === 2);
  assert.deepEqual(remark.feedback, ["no evidence quoted for evidence"], "reviewer reasons are passed to the Marker");
  const fix = corrections(run).find((e) => e.ref === "L003");
  assert.deepEqual([fix.stage, fix.data.before, fix.data.after, fix.data.route], ["correct", 90, 30, "marker"]);
  assert.equal(markerCalls.length, 8, "only the rejected script is re-marked");
  assert.match(run.log.at(-1).message, /7 of 7 marked, 1 corrected, 0 need teacher/);
  allValid(run);
});

test("a script still rejected after the retry limit is flagged needs teacher, and the loop ends", async () => {
  const ctx = seed(3);
  const reviewCalls = [];
  const markScript = scriptedMarker((id) => (id === "L002" ? 19 : 10));
  const reviewBatch = scriptedReviewer((m) => m.script_id === "L002", { calls: reviewCalls });
  await run1(ctx, { markScript, reviewBatch });

  const { run } = ctx;
  assert.equal(run.status, "done");
  assert.equal(run.marks.L002.attempt, MAX_ATTEMPTS);
  assert.equal(run.marks.L002.status, "needs_teacher");
  assert.ok(corrections(run).some((e) => e.ref === "L002" && e.data.status === "needs_teacher"));
  assert.equal(reviewCalls.length, MAX_ATTEMPTS, "one review per attempt, then stop");
  assert.match(run.log.at(-1).message, /1 needs teacher/);
});

test("drift sends the batch back to the Planner once: recalibrated plan, whole batch re-marked with the note", async () => {
  const ctx = seed(5);
  const markerCalls = [];
  const reviewCalls = [];
  const markScript = scriptedMarker((id, attempt) => (attempt === 1 ? 11 : 4 + Number(id.slice(-1)) * 3), { calls: markerCalls });
  // Drift reported on every review, so the run-level replan limit must stop it.
  const reviewBatch = scriptedReviewer(() => false, { drift: () => true, calls: reviewCalls });
  await run1(ctx, { markScript, reviewBatch });

  const { run } = ctx;
  assert.equal(run.status, "done");
  assert.equal(run.plan.replans, 1);
  assert.equal(run.plan.anchors_as_examples, true);
  const replans = corrections(run).filter((e) => e.data?.replan);
  assert.equal(replans.length, 1);
  assert.equal(replans[0].agent, "planner");
  const second = markerCalls.filter((c) => c.attempt === 2);
  assert.equal(second.length, 5, "the whole batch is re-marked");
  assert.match(second[0].feedback[0], /^Calibration:/);
  assert.deepEqual(reviewCalls.map((c) => c.checkAnchors), [true, true], "anchors checked first and again after recalibrating");
  assert.ok(run.log.some((e) => /replan limit reached/.test(e.message)));
});

test("anchors are only checked on the first batch (no wasted model calls)", async () => {
  const ctx = seed(12);
  const reviewCalls = [];
  await run1(ctx, { markScript: scriptedMarker(), reviewBatch: scriptedReviewer(() => false, { calls: reviewCalls }) });
  assert.deepEqual(reviewCalls.map((c) => c.checkAnchors), [true, false, false]);
  assert.deepEqual(reviewCalls.map((c) => c.ids.length), [5, 5, 2]);
});

test("marking runs in parallel up to the concurrency limit", async () => {
  const ctx = seed(10);
  let inFlight = 0;
  let peak = 0;
  const base = scriptedMarker();
  const markScript = async (input, c) => {
    inFlight++; peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 15));
    try { return await base(input, c); } finally { inFlight--; }
  };
  await run1(ctx, { markScript, reviewBatch: scriptedReviewer() }, { concurrency: 3 });
  assert.equal(peak, 3);
  assert.equal(Object.keys(ctx.run.marks).length, 10);
});

test("a Marker that throws is retried with the error as feedback", async () => {
  const ctx = seed(2);
  let failed = false;
  const base = scriptedMarker();
  const markScript = async (input, c) => {
    if (input.scriptId === "L001" && !failed) { failed = true; throw new Error("Marker feedback must be 80-150 words"); }
    return base(input, c);
  };
  await run1(ctx, { markScript, reviewBatch: scriptedReviewer() });
  assert.equal(ctx.run.marks.L001.attempt, 2);
  assert.ok(ctx.run.log.some((e) => e.kind === "error" && /attempt 1 failed/.test(e.message)));
  assert.equal(ctx.run.status, "done");
});

test("the run timeout stops the run with status error and ignores late results", async () => {
  const ctx = seed(4);
  await run1(ctx, { markScript: scriptedMarker(() => 10, { delayMs: 200 }), reviewBatch: scriptedReviewer() }, { timeoutMs: 50 });
  assert.equal(ctx.run.status, "error");
  assert.match(ctx.run.log.at(-2).message, /longer than/);
  const logLength = ctx.run.log.length;
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(ctx.run.log.length, logLength, "no events after the timeout");
  assert.equal(Object.keys(ctx.run.marks).length, 0);
});
