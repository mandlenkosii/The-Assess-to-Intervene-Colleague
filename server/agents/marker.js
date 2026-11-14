import { Mark } from "@colleague/shared";
import { env } from "../env.js";

// Handwritten scripts (FEATURE_HANDWRITING): appended only when the flag is on AND the script has [illegible] words,
// so typed scripts get exactly the same prompt as before.
export const ILLEGIBLE_NOTE = "This script was transcribed from handwriting. [illegible] marks a word that could not be read: treat it as missing text, never as a mistake, do not penalise the learner for it, never quote it as evidence, and say in the feedback that some words could not be read and were not counted against them.";
const illegibleNote = (text) => (env.FEATURE_HANDWRITING && /\[illegible\]/i.test(text) ? ` ${ILLEGIBLE_NOTE}` : "");

const MIN_FEEDBACK_WORDS = 80;
const MAX_FEEDBACK_WORDS = 150;

function wordCount(value) {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

export async function markScript({
  scriptId,
  text,
  rubric,
  anchors,
  feedback = [],
  attempt = 1
}, ctx) {
  if (typeof scriptId !== "string" || scriptId.length === 0) {
    throw new TypeError("scriptId is required");
  }
  if (typeof text !== "string" || text.trim() === "") {
    throw new TypeError(`Script "${scriptId}" must contain text`);
  }
  if (!ctx || typeof ctx.llm?.json !== "function") {
    throw new TypeError("ctx.llm.json is required");
  }

  const modelOutput = await ctx.llm.json([
    {
      role: "system",
      content: [
        "You are a careful Grade 10 English marker. Score every rubric criterion using only evidence in the script.",
        "Copy evidence quotes exactly from the script; never invent or paraphrase a quote.",
        "Write learner-facing feedback in 80-150 words.",
        "Return script_id, scores, and feedback. Do not calculate total_pct; the application calculates it."
      ].join(" ") + illegibleNote(text)
    },
    {
      role: "user",
      content: JSON.stringify({
        script_id: scriptId,
        rubric,
        anchors,
        reviewer_feedback_from_previous_attempt: feedback,
        script: text
      })
    }
  ], {
    schema: Mark.omit({ total_pct: true, attempt: true, status: true }),
    tier: "large",
    temperature: 0.2
  });

  const parsed = Mark.omit({ total_pct: true, attempt: true, status: true }).parse({
    script_id: scriptId,
    scores: modelOutput.scores,
    feedback: modelOutput.feedback
  });
  if (parsed.scores.length !== rubric.criteria.length) {
    throw new Error(`Marker returned ${parsed.scores.length} criteria; expected ${rubric.criteria.length}`);
  }
  if (wordCount(parsed.feedback) < MIN_FEEDBACK_WORDS || wordCount(parsed.feedback) > MAX_FEEDBACK_WORDS) {
    throw new Error(`Marker feedback must be ${MIN_FEEDBACK_WORDS}-${MAX_FEEDBACK_WORDS} words`);
  }

  const maximum = parsed.scores.reduce((sum, score) => sum + score.max_score, 0);
  if (maximum === 0) {
    throw new Error("Rubric maximum score must be greater than zero");
  }
  const earned = parsed.scores.reduce((sum, score) => sum + score.score, 0);
  const mark = Mark.parse({
    ...parsed,
    total_pct: (earned / maximum) * 100,
    attempt,
    status: "ok"
  });

  await ctx.emit?.({
    t: new Date().toISOString(),
    stage: "act",
    agent: "marker",
    kind: "mark",
    ref: scriptId,
    message: `Marked ${scriptId}: ${mark.total_pct.toFixed(1)}%`,
    data: { mark }
  });
  return mark;
}
