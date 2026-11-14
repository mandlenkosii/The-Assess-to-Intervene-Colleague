import { createHash } from "node:crypto";
import { Mark, promptHints } from "@colleague/shared";
import { checkMark } from "../checks.js";

const BlindMarkSchema = Mark.pick({ script_id: true, scores: true });
const BLIND_SHAPE = promptHints.Mark.replace(' "total_pct": number,', "").replace(/, "feedback": [^}]*\}$/, "}");

function stableRank(scriptId) {
  return createHash("sha256").update(scriptId).digest("hex");
}

function selectedForBlindRemark(marks, borderlineBand) {
  const entries = Object.entries(marks);
  const sampleSize = entries.length === 0 ? 0 : Math.max(1, Math.ceil(entries.length * 0.2));
  const selected = new Set(
    entries
      .slice()
      .sort(([left], [right]) => stableRank(left).localeCompare(stableRank(right)))
      .slice(0, sampleSize)
      .map(([scriptId]) => scriptId)
  );
  for (const [scriptId, mark] of entries) {
    if (mark.total_pct >= borderlineBand[0] && mark.total_pct <= borderlineBand[1]) {
      selected.add(scriptId);
    }
  }
  return selected;
}

function calculateTotal(scores) {
  const maximum = scores.reduce((sum, score) => sum + score.max_score, 0);
  if (maximum <= 0) {
    throw new Error("Cannot calculate a mark with no available rubric points");
  }
  return (scores.reduce((sum, score) => sum + score.score, 0) / maximum) * 100;
}

async function blindRemark({ scriptId, text, rubric }, ctx) {
  const output = await ctx.llm.json([
    {
      role: "system",
      content: [
        "You are an independent, strict marker. Mark the script without access to any earlier mark.",
        "Use the supplied rubric only, quote exact script evidence for every criterion, and return no feedback.",
        "Return script_id and scores only.",
        `Return exactly this JSON shape, with one score per rubric criterion: ${BLIND_SHAPE}`
      ].join(" ")
    },
    {
      role: "user",
      content: JSON.stringify({ script_id: scriptId, rubric, script: text })
    }
  ], {
    schema: BlindMarkSchema,
    tier: "large",
    temperature: 0
  });
  const mark = BlindMarkSchema.parse({
    script_id: scriptId,
    scores: output.scores
  });
  return { ...mark, total_pct: calculateTotal(mark.scores) };
}

function compareMarks(first, second) {
  const reasons = [];
  if (Math.abs(first.total_pct - second.total_pct) > 10) {
    reasons.push(`blind total differs by ${Math.abs(first.total_pct - second.total_pct).toFixed(1)} points`);
  }
  const blindScores = new Map(second.scores.map((score) => [score.criterion, score.score]));
  for (const score of first.scores) {
    const blindScore = blindScores.get(score.criterion);
    if (blindScore === undefined) {
      reasons.push(`blind mark is missing criterion ${score.criterion}`);
    } else if (Math.abs(score.score - blindScore) > 2) {
      reasons.push(`${score.criterion} differs by ${Math.abs(score.score - blindScore)} marks`);
    }
  }
  return reasons;
}

function standardDeviation(values) {
  if (values.length < 2) {
    return 0;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length);
}

function teacherMark(anchor) {
  return anchor.teacherMark || anchor.mark || anchor;
}

function teacherTotal(anchor) {
  const mark = teacherMark(anchor);
  return typeof mark.total_pct === "number" ? mark.total_pct : calculateTotal(mark.scores);
}

export async function reviewBatch({
  marks,
  scripts,
  anchors = {},
  rubric,
  plan = {},
  checkAnchors = true
}, ctx) {
  if (!marks || typeof marks !== "object" || !scripts || typeof scripts !== "object") {
    throw new TypeError("marks and scripts must be keyed by script id");
  }
  if (!rubric?.criteria || !Array.isArray(rubric.criteria)) {
    throw new TypeError("rubric.criteria is required");
  }
  if (typeof ctx?.llm?.json !== "function") {
    throw new TypeError("ctx.llm.json is required");
  }

  const borderlineBand = plan.borderline_band || [40, 55];
  const reviews = [];
  const blindMarks = {};
  for (const [scriptId, mark] of Object.entries(marks)) {
    const reasons = checkMark(mark, scripts[scriptId] || "", rubric).reasons;
    if (reasons.length > 0) {
      const review = { script_id: scriptId, verdict: "reject", reasons };
      reviews.push(review);
      await ctx.emit?.({
        t: new Date().toISOString(),
        stage: "check",
        agent: "calibrator",
        kind: "review",
        ref: scriptId,
        message: `Rejected ${scriptId}: ${reasons.join("; ")}`,
        data: { review }
      });
    } else {
      const review = { script_id: scriptId, verdict: "accept", reasons: [] };
      reviews.push(review);
      await ctx.emit?.({
        t: new Date().toISOString(),
        stage: "check",
        agent: "calibrator",
        kind: "review",
        ref: scriptId,
        message: `Code checks passed for ${scriptId}`,
        data: { review }
      });
    }
  }

  const codeCheckedMarks = Object.fromEntries(
    Object.entries(marks).filter(([scriptId]) =>
      reviews.find((review) => review.script_id === scriptId)?.verdict === "accept")
  );
  const sample = [...selectedForBlindRemark(codeCheckedMarks, borderlineBand)];
  const anchorList = checkAnchors ? Object.values(anchors) : [];
  for (const anchor of anchorList) {
    if (typeof anchor.text !== "string" || !anchor.text.trim()) {
      throw new Error(`Anchor "${anchor.script_id || "unknown"}" is missing script text`);
    }
  }
  const anchorIdOf = (anchor) => anchor.script_id || teacherMark(anchor).script_id;

  // Performance: start every blind re-mark (sample + anchors) at once instead of one after another.
  // The orchestrator caps concurrent model calls, so this stays inside rate limits.
  // Results are then processed in the original order, so events and decisions are unchanged.
  const [sampleResults, anchorResults] = await Promise.all([
    Promise.all(sample.map((scriptId) => blindRemark({ scriptId, text: scripts[scriptId], rubric }, ctx))),
    Promise.all(anchorList.map((anchor) => blindRemark({ scriptId: anchorIdOf(anchor), text: anchor.text, rubric }, ctx)))
  ]);

  for (const [index, scriptId] of sample.entries()) {
    const blindMark = sampleResults[index];
    blindMarks[scriptId] = blindMark;
    const review = reviews.find((candidate) => candidate.script_id === scriptId);
    if (review?.verdict === "reject") {
      continue;
    }
    const reasons = compareMarks(marks[scriptId], blindMark);
    if (reasons.length > 0) {
      review.verdict = "reject";
      review.reasons = reasons;
      await ctx.emit?.({
        t: new Date().toISOString(),
        stage: "check",
        agent: "calibrator",
        kind: "review",
        ref: scriptId,
        message: `Rejected ${scriptId}: ${reasons.join("; ")}`,
        data: { review, blind_mark: blindMark }
      });
    }
  }

  const driftReasons = [];
  const anchorTotals = [];
  if (checkAnchors) {
    for (const [index, anchor] of anchorList.entries()) {
      const anchorId = anchorIdOf(anchor);
      const blind = anchorResults[index];
      const expected = teacherTotal(anchor);
      anchorTotals.push(expected);
      if (Math.abs(blind.total_pct - expected) > 10) {
        driftReasons.push(`${anchorId}: re-mark ${blind.total_pct.toFixed(1)}% differs from teacher mark ${expected.toFixed(1)}%`);
      }
    }
  }

  const batchTotals = Object.values(marks).map((mark) => mark.total_pct);
  const middleCount = batchTotals.filter((total) => total >= 45 && total <= 65).length;
  if (batchTotals.length > 0 && middleCount / batchTotals.length > 0.6) {
    driftReasons.push(`more than 60% of the batch (${middleCount}/${batchTotals.length}) falls in the 45-65% middle band`);
  }
  const batchDeviation = standardDeviation(batchTotals);
  const anchorDeviation = standardDeviation(anchorTotals);
  if (anchorTotals.length > 1 && batchDeviation < anchorDeviation * 0.5) {
    driftReasons.push(`batch spread (${batchDeviation.toFixed(1)}) is far below anchor spread (${anchorDeviation.toFixed(1)})`);
  }

  return {
    reviews,
    drift: { flag: driftReasons.length > 0, reason: driftReasons.join("; ") },
    blindMarks
  };
}
