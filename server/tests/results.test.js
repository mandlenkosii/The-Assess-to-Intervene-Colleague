// Phase 5: demo results are measured from the run, honestly (traps, accuracy, evidence, model label).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRunStore } from "../runStore.js";
import { loadDemoInputs } from "../inputs.js";
import { runColleague, approveRun } from "../orchestrator.js";
import { computeResults } from "../results.js";
import { createFakeLLM } from "../scripts/fakeLLM.js";
import { readFileSync } from "node:fs";

const expected = JSON.parse(readFileSync(new URL("../../data/expected.json", import.meta.url), "utf8"));
const sendAll = async (run) => Object.values(run.learners).map((l) => ({ learner_id: l.learner_id, to: l.email, subject: "s", html: "", status: "sent" }));

test("results are measured from a real pipeline run and labelled with the model that produced them", async () => {
  const store = createRunStore({ persist: false });
  const run = store.create(await loadDemoInputs());
  const llm = createFakeLLM();
  const deps = { store, llm, agents: { sendAll, marksXlsx: null } };
  await runColleague(run.id, deps);
  await approveRun(run.id, {}, deps).delivery;

  const r = computeResults(run, expected);
  assert.equal(r.model, "fake", "rehearsal runs are identifiable");
  assert.equal(r.scripts.marked, 30);
  assert.equal(r.evidence.verbatim, r.evidence.scores, "every fake quote is taken from the script");
  assert.equal(r.accuracy.compared, 30);
  assert.equal(r.traps.total, 7);
  const offTopic = r.traps.detail.find((t) => t.trap === "long_off_topic");
  assert.equal(offTopic.rejected_by_reviewer, true);
  assert.ok(offTopic.first_pct > offTopic.final_pct, "first mark was higher than the corrected one");
  assert.equal(offTopic.handled, true);
  assert.equal(r.corrections.replans, 1);
  assert.ok(r.corrections.tasks_rebuilt > 0);
  assert.equal(r.delivery.approved, true);
  assert.equal(r.delivery.sent, 30);
  assert.equal(r.collaboration.agents, 7);
  assert.ok(r.model_calls.live > 0);
  assert.match(r.closing_line, /^30 scripts, \d+ marks? corrected, \d of 7 traps caught/);
  for (const key of ["reasons", "self_corrects", "executes", "collaborates", "serves_education"]) assert.ok(r.criteria[key], key);
});

test("a trap only counts as handled when the outcome matches what the team expected", () => {
  const mk = (id, pct) => ({ script_id: id, total_pct: pct, scores: [{ criterion: "argument", score: 1, max_score: 1, evidence: "x" }], attempt: 1, status: "ok" });
  const run = {
    id: "r", plan: { borderline: [40, 55], batches: [[]] }, scripts: { L024: "x", L029: "x" },
    marks: { L024: mk("L024", 80), L029: mk("L029", 55) },
    diagnoses: { L029: { learner_id: "L029", root_gap: "evidence", severity: "watch" } },
    tasks: {}, log: [{ t: "2026-01-01T00:00:00Z", agent: "teacher", kind: "log", data: { model: "groq:llama" } }],
  };
  const exp = { accuracy_tolerance_percentage_points: 10, scripts: [
    { script_id: "L024", expected_total_pct: 45, trap: "long_off_topic", expected_review: "rejected" },
    { script_id: "L029", expected_total_pct: 56, trap: "weak_structure_only", expected_review: "accepted" },
  ] };
  const r = computeResults(run, exp);
  assert.equal(r.model, "groq:llama");
  assert.equal(r.traps.detail[0].handled, false, "never rejected and still over-marked");
  assert.equal(r.traps.detail[1].handled, false, "mark is close but the gap isn't structure");
  assert.equal(r.accuracy.within, 1);
});
