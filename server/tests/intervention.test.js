import test from "node:test";
import assert from "node:assert/strict";
import { diagnose } from "../agents/diagnostician.js";
import { buildTask } from "../agents/builder.js";
import { checkTask } from "../agents/checker.js";
import { brief, marksXlsx, sendAll } from "../agents/delivery.js";
import { LogEvent } from "@colleague/shared";

const mark = (learner_id, total_pct, attempt = 1) => ({
  learner_id,
  script_id: learner_id,
  total_pct,
  attempt,
  status: "ok",
  feedback: "Support your main point with evidence.",
  scores: [
    { criterion: "argument", score: 8, max_score: 20, evidence: "I think", reason: "Claim needs development" },
    { criterion: "evidence", score: 5, max_score: 20, evidence: "for example", reason: "Use relevant detail" }
  ]
});

test("diagnose computes severity and class-wide gaps from the scores", async () => {
  const calls = [];
  const result = await diagnose({
    marks: [mark("L1", 45), mark("L2", 78)],
    rubric: {},
    plan: { pass_mark: 50, borderline_band: [40, 55] },
    learners: []
  }, {
    llm: {
      async json(_messages, options) {
        calls.push(options);
        return { learner_id: "L1", root_gap: "evidence", severity: "on_track", evidence: ["invented quote"] };
      }
    }
  });

  assert.equal(result.diagnoses[0].severity, "needs_help");
  assert.equal(result.diagnoses[1].severity, "on_track");
  assert.equal(result.diagnoses[0].learner_id, "L1");
  assert.deepEqual(result.diagnoses[0].evidence, ["for example"]);
  assert.equal(calls.length, 1);
  assert.equal(result.classGaps[0].criterion, "evidence");
});

test("builder rejects tasks that miss required length or answer coverage", async () => {
  const ctx = {
    llm: {
      async json() {
        return {
          learner_id: "L1",
          gap: "evidence",
          instructions: "Practice using evidence.",
          questions: ["1", "2", "3"],
          answer_key: ["one"],
          attempt: 1,
          status: "ok"
        };
      }
    }
  };
  await assert.rejects(
    buildTask({ diagnosis: { learner_id: "L1", root_gap: "evidence" }, rubric: {} }, ctx),
    /one answer per question/
  );
});

test("checker rejects invalid task details without a model call", async () => {
  const task = {
    learner_id: "L1",
    gap: "structure",
    instructions: "Practice",
    questions: ["one", "two"],
    answer_key: [],
    attempt: 1,
    status: "ok"
  };
  const review = await checkTask({
    task,
    diagnosis: { learner_id: "L1", root_gap: "evidence", severity: "needs_help", evidence: [] }
  }, {});
  assert.equal(review.verdict, "reject");
  assert.ok(review.reasons.length >= 3);
});

test("checker accepts a schema-valid task after a model review", async () => {
  const task = {
    learner_id: "L1",
    gap: "evidence",
    instructions: "Practise choosing relevant evidence for an argument.",
    questions: ["A", "B", "C"],
    answer_key: ["A1", "B1", "C1"],
    attempt: 1,
    status: "ok"
  };
  const events = [];
  const review = await checkTask({
    task,
    diagnosis: { learner_id: "L1", root_gap: "evidence", severity: "needs_help", evidence: [] }
  }, {
    llm: {
      async json() {
        return { script_id: "L1", verdict: "accept", reasons: [] };
      }
    },
    emit: async (event) => events.push(event)
  });
  assert.equal(review.verdict, "accept");
  assert.equal(LogEvent.parse(events[0]).stage, "check");
});

test("brief reports computed counts, learner gaps, and unresolved scripts", async () => {
  const content = await brief({
    run: {
      marks: [mark("L1", 42, 2), { ...mark("L2", 50), status: "needs_teacher" }],
      diagnoses: [
        { learner_id: "L1", root_gap: "evidence", severity: "needs_help" }
      ],
      classGaps: [{ criterion: "evidence", average_pct: 32.5 }]
    }
  });
  assert.match(content, /Corrections made: 1/);
  assert.match(content, /\*\*evidence:\*\* L1/);
  assert.match(content, /L2/);
  assert.match(content, /32\.5% average/);
});

test("brief model summary receives computed facts and cannot replace computed figures", async () => {
  let request;
  const content = await brief({
    run: { marks: [mark("L1", 50)], diagnoses: [], classGaps: [] }
  }, {
    llm: {
      async json(messages, options) {
        request = { messages, options };
        return { summary: "One script is ready for review." };
      }
    }
  });
  assert.match(request.messages[1].content, /"scripts_marked":1/);
  assert.equal(request.options.tier, "small");
  assert.match(content, /Scripts marked: 1/);
  assert.match(content, /One script is ready for review/);
});

test("delivery preserves preview and reports unavailable credentials instead of claiming success", async () => {
  const events = [];
  const outbox = await sendAll({
    learners: [
      { learner_id: "L1", name: "<learner>", email: "TEAM_INBOX_1" },
      { learner_id: "L2", name: "Learner Two", email: "TEAM_INBOX_2" }
    ],
    marks: [mark("L1", 42)],
    diagnoses: [],
    tasks: {}
  }, { env: {}, ctx: { emit: async (event) => events.push(event) } });

  assert.equal(outbox[0].status, "failed");
  assert.match(outbox[0].error, /SMTP_USER/);
  assert.match(outbox[0].html, /&lt;learner&gt;/);
  assert.equal(LogEvent.parse(events[0]).stage, "deliver");
  assert.equal(outbox[1].status, "skipped");
  assert.equal(outbox[1].reason, "No final mark available");
});

test("marks workbook includes per-criterion and status columns", async () => {
  const workbook = await marksXlsx({
    marks: [mark("L1", 60)],
    diagnoses: [{ learner_id: "L1", root_gap: "evidence" }]
  });
  const sheet = workbook.getWorksheet("Marks");
  assert.equal(sheet.getRow(1).getCell(1).value, "Learner");
  assert.equal(sheet.getRow(1).getCell(2).value, "argument");
  assert.equal(sheet.getRow(2).getCell(1).value, "L1");
});
