import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadLearners, normalizeWhitespace, toText } from "../server/parse.js";
import { checkMark, quoteExists } from "../server/checks.js";
import { markScript } from "../server/agents/marker.js";
import { reviewBatch } from "../server/agents/calibrator.js";
import { demoScripts, expectedMarks } from "../data/scripts.js";
import rubric from "../data/rubric.json" with { type: "json" };

test("demo dataset contains 30 uniquely identified scripts and the seven required traps", async () => {
  assert.equal(demoScripts.length, 30);
  assert.equal(new Set(demoScripts.map(({ script_id }) => script_id)).size, 30);
  assert.ok(demoScripts.filter(({ trap }) => trap !== "short_excellent")
    .every(({ text }) => text.trim().split(/\s+/u).length >= 250));
  assert.deepEqual(
    demoScripts.filter(({ trap }) => trap).map(({ trap }) => trap),
    [
      "long_off_topic",
      "short_excellent",
      "fluent_no_evidence",
      "borderline",
      "borderline",
      "weak_structure_only",
      "weak_structure_only"
    ]
  );
  const csv = await readFile(new URL("../data/learners.csv", import.meta.url), "utf8");
  assert.equal(loadLearners(csv).length, 30);
  const expected = JSON.parse(await readFile(new URL("../data/expected.json", import.meta.url), "utf8"));
  assert.equal(expected.scripts.length, 30);
  assert.equal(expected.scripts.filter(({ trap }) => trap).length, 7);
  const expectedTotals = new Map(expected.scripts.map(({ script_id, expected_total_pct }) => [script_id, expected_total_pct]));
  for (const mark of expectedMarks) {
    const total = Object.values(mark.scores).reduce((sum, score) => sum + score, 0);
    assert.equal(total, expectedTotals.get(mark.script_id), `${mark.script_id} expected mark should add up`);
  }
});

test("whitespace and quote normalization allow equivalent verbatim evidence", () => {
  assert.equal(normalizeWhitespace("  one \n two  "), "one two");
  assert.equal(quoteExists("“the teacher-approved dictionary app”", "Use the teacher-approved dictionary app."), true);
  assert.equal(quoteExists("entirely invented quote", "This is the actual script text."), false);
});

test("mark checks report absent evidence, invalid criterion marks and arithmetic", () => {
  const mark = {
    script_id: "script_01",
    scores: rubric.criteria.map((criterion, index) => ({
      criterion: criterion.name,
      score: index === 0 ? 21 : 10,
      max_score: criterion.max_score,
      evidence: index === 1 ? "fabricated words" : "a real phrase",
      reason: "A reason"
    })),
    total_pct: 100,
    feedback: "Feedback"
  };
  const result = checkMark(mark, "A real phrase is present.", rubric);
  assert.equal(result.ok, false);
  assert.ok(result.reasons.some((reason) => reason.includes("no evidence quoted for evidence")));
  assert.ok(result.reasons.includes("scores are outside the rubric range or criteria do not match"));
  assert.ok(result.reasons.includes("scores don't add up"));
});

test("mark checks reject duplicated criteria even when all individual scores are in range", () => {
  const duplicateScores = rubric.criteria.map((criterion) => ({
    criterion: criterion.name,
    score: 10,
    max_score: criterion.max_score,
    evidence: "a fair policy",
    reason: "A reason"
  }));
  duplicateScores[4] = { ...duplicateScores[4], criterion: "argument" };
  const result = checkMark({
    script_id: "script_01",
    scores: duplicateScores,
    total_pct: 50,
    feedback: "Feedback"
  }, "A fair policy can support learners.", rubric);
  assert.ok(result.reasons.includes("scores are outside the rubric range or criteria do not match"));
});

test("marker computes totals and emits the event instead of trusting model arithmetic", async () => {
  const response = {
    script_id: "script_01",
    scores: rubric.criteria.map((criterion) => ({
      criterion: criterion.name,
      score: 10,
      max_score: criterion.max_score,
      evidence: "a fair policy",
      reason: "The script explains this point."
    })),
    feedback: Array.from({ length: 85 }, (_, index) => index % 2 === 0 ? "Careful" : "work").join(" ")
  };
  const events = [];
  const mark = await markScript({
    scriptId: "script_01",
    text: "A fair policy can support learners.",
    rubric,
    anchors: {},
    attempt: 2
  }, {
    llm: { json: async () => response },
    emit: (event) => events.push(event)
  });

  assert.equal(mark.total_pct, 50);
  assert.equal(mark.attempt, 2);
  assert.equal(mark.status, "ok");
  assert.equal(events[0].kind, "mark");
  assert.equal(events[0].data.mark.total_pct, 50);
});

test("parsing accepts text files and reports unsupported types and malformed learner rows", async () => {
  assert.equal(await toText({ name: "script.txt", buffer: Buffer.from("Typed response") }), "Typed response");
  await assert.rejects(
    toText({ name: "script.rtf", buffer: Buffer.from("content") }),
    /Unsupported file type/
  );
  assert.throws(() => loadLearners("learner_id,name,grade,email\nx,Name,10,invalid"), /invalid email/);
});

test("calibrator rejects code-check failures before requesting any blind re-mark", async () => {
  const events = [];
  const result = await reviewBatch({
    marks: {
      bad: {
        script_id: "bad",
        scores: rubric.criteria.map((criterion, index) => ({
          criterion: criterion.name,
          score: index === 0 ? 21 : 10,
          max_score: criterion.max_score,
          evidence: "invented",
          reason: "A reason"
        })),
        total_pct: 100,
        feedback: "Feedback"
      }
    },
    scripts: { bad: "The script has no matching evidence." },
    rubric,
    checkAnchors: false
  }, {
    llm: { json: async () => assert.fail("code-check rejection must not call the model") },
    emit: (event) => events.push(event)
  });

  assert.equal(result.reviews[0].verdict, "reject");
  assert.ok(result.reviews[0].reasons.some((reason) => reason === "scores don't add up"));
  assert.equal(events[0].stage, "check");
});

test("calibrator blind re-marks a deterministic 20% sample and every borderline script", async () => {
  const marks = Object.fromEntries(Array.from({ length: 10 }, (_, index) => {
    const scriptId = `script_${index + 1}`;
    return [scriptId, {
      script_id: scriptId,
      scores: rubric.criteria.map((criterion) => ({
        criterion: criterion.name,
        score: index === 0 ? 10 : 14,
        max_score: criterion.max_score,
        evidence: "A quote",
        reason: "A reason"
      })),
      total_pct: index === 0 ? 50 : 70,
      feedback: "Feedback"
    }];
  }));
  const modelCalls = [];
  const result = await reviewBatch({
    marks,
    scripts: Object.fromEntries(Object.keys(marks).map((id) => [id, "A quote in this script."])),
    rubric,
    plan: { borderline_band: [40, 55] },
    checkAnchors: false
  }, {
    llm: {
      json: async (messages) => {
        modelCalls.push(messages);
        const request = JSON.parse(messages[1].content);
        const score = request.script_id === "script_1" ? 10 : 14;
        return {
          script_id: request.script_id,
          scores: rubric.criteria.map((criterion) => ({
            criterion: criterion.name,
            score,
            max_score: criterion.max_score,
            evidence: "A quote",
            reason: "A reason"
          }))
        };
      }
    }
  });

  assert.ok(modelCalls.length >= 2 && modelCalls.length <= 3);
  assert.equal(Object.keys(result.blindMarks).length, modelCalls.length);
  assert.equal(result.reviews.filter(({ verdict }) => verdict === "reject").length, 0);
});
