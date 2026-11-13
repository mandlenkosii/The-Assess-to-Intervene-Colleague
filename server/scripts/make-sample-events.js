// Writes data/sample-events.jsonl: a realistic fake full run so the UI can be built before the back end exists.
// Every event is validated against the frozen LogEvent schema. Run: npm run sample-events
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { LogEvent, Mark } from "@colleague/shared";
import { ROOT } from "../env.js";

const CRITERIA = ["argument", "evidence", "structure", "language", "audience"];
let clock = Date.parse("2026-11-13T09:00:00Z");
const events = [];
const ev = (stage, agent, kind, message, extra = {}) => {
  clock += 400 + Math.round(Math.random() * 900);
  events.push(LogEvent.parse({ t: new Date(clock).toISOString(), stage, agent, kind, message, ...extra }));
};
const status = (stage, agent, s, message) => ev(stage, agent, "status", message, { data: { status: s } });

function mark(id, scores, quotes, attempt = 1, statusVal = "ok") {
  const s = CRITERIA.map((c, i) => ({
    criterion: c, score: scores[i], max_score: 20,
    evidence: quotes[i] ?? "",
    reason: `${c} at level ${Math.ceil(scores[i] / 4)} of the rubric descriptors.`,
  }));
  const total = s.reduce((a, x) => a + x.score, 0);
  return Mark.parse({
    script_id: id, scores: s, total_pct: total, attempt, status: statusVal,
    feedback: `You take a clear position on cellphones in class. To improve, support each point with a specific example and link your paragraphs so the reader can follow your reasoning from start to finish.`,
  });
}
const q = ["Cellphones should be allowed because they help us research.", "A 2023 survey at our school found most learners use phones for homework.", "Firstly, ... Secondly, ... In conclusion,", "Although some teachers disagree, the benefits are clear.", "Dear Principal, I am writing to you because"];

// GOAL + PLAN
status("goal", "teacher", "planning", "Run started");
ev("goal", "teacher", "log", "Goal: Mark this class set against the rubric, check the marks, and prepare catch-up plans for anyone who is struggling.");
ev("plan", "planner", "stage", "Planning the work");
ev("plan", "planner", "log", "Rubric parsed: 5 criteria (argument, evidence, structure, language, audience), 20 marks each");
ev("plan", "planner", "log", "30 scripts split into 6 batches of 5; pass mark 50%, borderline band 40–55%", {
  data: { plan: { batches: 6, pass_mark: 50, borderline: [40, 55] } },
});
ev("plan", "planner", "log", "3 anchor scripts loaded (weak 35%, middle 58%, strong 82%) for calibration");

// ACT: marking batch 1
status("act", "marker", "marking", "Marking batch 1 of 6");
const batch1 = {
  L01: [14, 12, 13, 14, 12], L02: [9, 8, 10, 11, 9], L03: [16, 15, 14, 15, 16],
  L04: [15, 14, 12, 16, 14], L05: [10, 10, 6, 12, 10],
};
for (const [id, sc] of Object.entries(batch1)) {
  const m = mark(id, sc, q);
  ev("act", "marker", "mark", `${id}: ${m.total_pct}%`, { ref: id, data: { mark: m } });
}

// CHECK + CORRECT: reviewer
ev("check", "calibrator", "stage", "Reviewing batch 1: code checks, then blind re-mark of 20% + borderline");
ev("check", "calibrator", "review", "L01: accepted (all evidence found, totals add up)", { ref: "L01", data: { review: { script_id: "L01", verdict: "accept", reasons: [] } } });
ev("check", "calibrator", "review", "L03: accepted", { ref: "L03", data: { review: { script_id: "L03", verdict: "accept", reasons: [] } } });
ev("check", "calibrator", "review", "L04: rejected, long but off-topic: argument scored 15 for content about school uniforms", {
  ref: "L04", data: { review: { script_id: "L04", verdict: "reject", reasons: ["argument: content is about school uniforms, not cellphones", "evidence: quote does not support the stated position"] } },
});
ev("correct", "calibrator", "correction", "L04 sent back to Marker: off-topic content over-rewarded", {
  ref: "L04", data: { before: 71, after: null, reasons: ["argument: off-topic", "evidence: unrelated quote"], attempt: 1 },
});
ev("act", "marker", "mark", "L04 re-marked: 71% → 38%", { ref: "L04", data: { mark: mark("L04", [5, 6, 10, 12, 5], q, 2) } });
ev("correct", "calibrator", "correction", "L04: 71% → 38% after re-mark (argument 15 → 5, evidence 14 → 6)", {
  ref: "L04", data: { before: 71, after: 38, reasons: ["Off-topic essay was rewarded for length"], attempt: 2 },
});
ev("check", "calibrator", "review", "L04: accepted on attempt 2", { ref: "L04", data: { review: { script_id: "L04", verdict: "accept", reasons: [] } } });

// Batch 2 with no-evidence trap + borderline
status("act", "marker", "marking", "Marking batch 2 of 6");
const batch2 = { L06: [13, 14, 12, 13, 13], L07: [16, 15, 15, 17, 16], L08: [11, 9, 10, 10, 11], L09: [12, 11, 13, 12, 12], L10: [9, 9, 9, 10, 9] };
for (const [id, sc] of Object.entries(batch2)) {
  const m = mark(id, sc, q);
  ev("act", "marker", "mark", `${id}: ${m.total_pct}%`, { ref: id, data: { mark: m } });
}
ev("check", "calibrator", "review", "L07: rejected, no evidence quoted for 'evidence'; quote not found in script", {
  ref: "L07", data: { review: { script_id: "L07", verdict: "reject", reasons: ["no evidence quoted for evidence", "quote for argument not found verbatim"] } },
});
ev("correct", "calibrator", "correction", "L07: 79% → 61% (evidence 15 → 6: fluent writing but no supporting evidence)", {
  ref: "L07", data: { before: 79, after: 61, reasons: ["Fluent essay with no evidence was over-rewarded"], attempt: 2 },
});
ev("check", "calibrator", "review", "L10: borderline (46%), blind re-mark gave 44%, accepted", {
  ref: "L10", data: { review: { script_id: "L10", verdict: "accept", reasons: [], blind_total_pct: 44 } },
});
ev("check", "calibrator", "review", "L08: borderline (51%), blind re-mark gave 39%, rejected (12 points apart)", {
  ref: "L08", data: { review: { script_id: "L08", verdict: "reject", reasons: ["blind re-mark 39% vs first mark 51%", "structure differs by 4"], blind_total_pct: 39 } },
});
ev("correct", "calibrator", "correction", "L08: 51% → 43% after re-mark with reviewer reasons", {
  ref: "L08", data: { before: 51, after: 43, reasons: ["Borderline disagreement over 10 points"], attempt: 2 },
});

// Drift → replan
ev("check", "calibrator", "log", "Drift check: 68% of batch 3 totals in the 45–65% band; anchor 'strong' marked 66% vs teacher 82%", { ref: "batch_3" });
ev("correct", "planner", "correction", "Replan: anchors added as worked examples to the Marker; re-marking batch 3", {
  ref: "batch_3", data: { replan: true, reasons: ["Middle-mark drift", "Anchor disagreement 16 points"] },
});
status("act", "marker", "marking", "Re-marking batch 3 with anchors as examples");
ev("act", "marker", "log", "Batch 3 re-marked: spread widened (std dev 6.1 → 13.4); anchor 'strong' now 80%", { ref: "batch_3" });
ev("check", "calibrator", "log", "Batches 4–6 marked and reviewed: 2 rejections corrected, 1 needs teacher");
ev("correct", "calibrator", "correction", "L22: still disagreeing after 2 re-marks, flagged needs teacher", {
  ref: "L22", data: { before: 48, after: 48, reasons: ["Blind re-mark 36% vs 48% on attempt 3"], attempt: 3, status: "needs_teacher" },
});
ev("check", "calibrator", "log", "Marking complete: 30 scripts, 6 corrections, 1 needs teacher");

// INTERVENE
status("plan", "diagnostician", "intervening", "Diagnosing learners");
const diags = [
  ["L04", "staying on the question topic", "needs_help"], ["L05", "structuring an argument", "needs_help"],
  ["L08", "using evidence to support a point", "needs_help"], ["L10", "structuring an argument", "watch"],
  ["L02", "using evidence to support a point", "needs_help"],
];
for (const [id, gap, sev] of diags) {
  ev("act", "diagnostician", "diagnosis", `${id}: ${sev.replace("_", " ")}, ${gap}`, {
    ref: id, data: { diagnosis: { learner_id: id, root_gap: gap, severity: sev, evidence: ["structure 6/20: paragraphs are not linked"] } },
  });
}
ev("act", "diagnostician", "log", "Class-wide gaps: evidence (avg 52%) and structure (avg 55%)", { data: { classGaps: ["evidence", "structure"] } });

const task = (id, gap, attempt = 1) => ({
  learner_id: id, gap, attempt, status: "ok",
  instructions: "Read the short paragraph below. Then answer the questions to practise organising an argument into clear, linked paragraphs.",
  questions: ["Write a topic sentence for the paragraph.", "Which linking word best connects the second and third sentences?", "Reorder the four sentences into a logical argument."],
  answer_key: ["Any sentence that states the main claim.", "'Furthermore' or 'In addition'.", "C, A, D, B"],
});
ev("act", "builder", "task", "L05: catch-up task built (structure)", { ref: "L05", data: { task: task("L05", "structuring an argument") } });
ev("check", "checker", "review", "L05: accepted, targets structure at Grade 10 level", { ref: "L05", data: { review: { script_id: "L05", verdict: "accept", reasons: [] } } });
ev("act", "builder", "task", "L08: catch-up task built", { ref: "L08", data: { task: task("L08", "grammar and spelling") } });
ev("check", "checker", "review", "L08: rejected, task practises grammar but the gap is evidence", {
  ref: "L08", data: { review: { script_id: "L08", verdict: "reject", reasons: ["Task gap 'grammar' does not match diagnosis 'using evidence'"] } },
});
ev("correct", "checker", "correction", "L08: task sent back to Builder: gap mismatch", {
  ref: "L08", data: { before: "grammar and spelling", after: null, reasons: ["Gap mismatch"], attempt: 1 },
});
ev("act", "builder", "task", "L08: task rebuilt (evidence)", { ref: "L08", data: { task: task("L08", "using evidence to support a point", 2) } });
ev("correct", "checker", "correction", "L08: task rebuilt to target evidence, accepted", {
  ref: "L08", data: { before: "grammar and spelling", after: "using evidence to support a point", reasons: ["Gap mismatch fixed"], attempt: 2 },
});
ev("check", "checker", "log", "9 catch-up tasks built and checked; 1 rebuilt");

// APPROVAL
ev("deliver", "delivery", "log", "Teacher brief drafted (1 page)");
status("deliver", "teacher", "awaiting_approval", "Waiting for teacher approval; nothing has been sent");
ev("deliver", "teacher", "log", "Teacher approved; 1 learner excluded (L22 needs teacher)");
status("deliver", "delivery", "delivering", "Delivering");
for (const id of ["L02", "L04", "L05", "L08"]) {
  ev("deliver", "delivery", "log", `Email sent to ${id}`, { ref: id, data: { email: { to: `${id}@example.test`, status: "sent" } } });
}
ev("deliver", "delivery", "log", "marks.xlsx written (30 rows)");
ev("deliver", "delivery", "log", "Summary: 30 marked · 6 marks corrected · 1 task rebuilt · 1 replan · 1 needs teacher");
status("deliver", "delivery", "done", "Run complete");

const out = join(ROOT, "data", "sample-events.jsonl");
writeFileSync(out, events.map((e) => JSON.stringify(e)).join("\n") + "\n");
console.log(`wrote ${events.length} validated events to ${out}`);
