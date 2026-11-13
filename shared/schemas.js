// Shared data contracts for server and web. FROZEN at H2: changes need the whole team's OK.
// Convention: one script per learner, so script_id === learner_id (e.g. "L07").
import { z } from "zod";

export const STAGES = ["goal", "plan", "act", "check", "correct", "deliver"];
export const AGENTS = ["planner", "marker", "calibrator", "diagnostician", "builder", "checker", "delivery", "teacher"];
export const KINDS = ["stage", "log", "mark", "review", "correction", "diagnosis", "task", "status", "error"];
export const RUN_STATUS = [
  "planning", "marking", "reviewing", "intervening",
  "awaiting_approval", "delivering", "done", "error",
];
export const ITEM_STATUS = ["ok", "needs_teacher"];
export const SEVERITY = ["on_track", "watch", "needs_help"];

export const CriterionScore = z.object({
  criterion: z.string(),                 // e.g. "argument"
  score: z.number().int().min(0),
  max_score: z.number().int().positive(),
  evidence: z.string(),                  // exact quote from the script
  reason: z.string(),
});

export const Mark = z.object({
  script_id: z.string(),
  scores: z.array(CriterionScore).min(1),
  total_pct: z.number().min(0).max(100),  // computed in code, never trusted from the model
  feedback: z.string(),                   // to the learner, 80–150 words
  attempt: z.number().int().min(1).default(1),
  status: z.enum(ITEM_STATUS).default("ok"),
});

export const Review = z.object({
  script_id: z.string(),
  verdict: z.enum(["accept", "reject"]),
  reasons: z.array(z.string()).default([]),  // shown in the correction log
  blind_total_pct: z.number().nullable().optional(),
});

export const Diagnosis = z.object({
  learner_id: z.string(),
  root_gap: z.string(),                   // e.g. "structuring an argument"
  severity: z.enum(SEVERITY),
  evidence: z.array(z.string()).default([]),
});

export const Task = z.object({
  learner_id: z.string(),
  gap: z.string(),
  instructions: z.string(),
  questions: z.array(z.string()).min(1),
  answer_key: z.array(z.string()).min(1),
  attempt: z.number().int().min(1).default(1),
  status: z.enum(ITEM_STATUS).default("ok"),
});

// One SSE event / one line in runs/<id>/log.jsonl. Drives trace, correction log, cards and 3D scene.
export const LogEvent = z.object({
  t: z.string(),                          // ISO timestamp
  stage: z.enum(STAGES),
  agent: z.enum(AGENTS),
  kind: z.enum(KINDS),
  ref: z.string().optional(),             // "L14" (script/learner) or "batch_2"
  message: z.string(),                    // e.g. "L14: argument 7 → 5, no evidence quoted"
  data: z.record(z.any()).optional(),     // {before, after, reasons, mark, task, status, ...}
});

export const Plan = z.object({
  batches: z.array(z.array(z.string())),  // script ids, batches of 5
  criteria: z.array(z.object({ name: z.string(), max_score: z.number().int().positive(), descriptor: z.string().optional() })),
  pass_mark: z.number().default(50),
  borderline: z.tuple([z.number(), z.number()]).default([40, 55]),
  anchors_as_examples: z.boolean().default(false), // set true by a recalibration (replan)
  replans: z.number().int().default(0),
});

export const Learner = z.object({
  learner_id: z.string(),
  name: z.string(),
  grade: z.coerce.number().int(),
  email: z.string(),
});

export const RunState = z.object({
  id: z.string(),
  goal: z.string(),
  status: z.enum(RUN_STATUS).default("planning"),
  rubric: z.record(z.any()),
  anchors: z.record(z.object({ text: z.string(), mark: Mark })).default({}),
  scripts: z.record(z.string()).default({}),          // script_id -> text
  learners: z.record(Learner).default({}),
  plan: Plan.nullable().default(null),
  marks: z.record(Mark).default({}),
  reviews: z.record(Review).default({}),
  diagnoses: z.record(Diagnosis).default({}),
  tasks: z.record(Task).default({}),
  brief: z.string().nullable().default(null),
  approved: z.boolean().default(false),
  excluded: z.array(z.string()).default([]),
  log: z.array(LogEvent).default([]),
  created_at: z.string(),
});

// Short shape descriptions to paste into prompts (models follow these better than raw JSON Schema).
export const promptHints = {
  Mark: `{"script_id": string, "scores": [{"criterion": string, "score": integer, "max_score": integer, "evidence": "EXACT verbatim quote from the script", "reason": string}], "total_pct": number, "feedback": "80-150 words to the learner"}`,
  Review: `{"script_id": string, "verdict": "accept"|"reject", "reasons": [string], "blind_total_pct": number|null}`,
  Diagnosis: `{"learner_id": string, "root_gap": string, "severity": "on_track"|"watch"|"needs_help", "evidence": [string]}`,
  Task: `{"learner_id": string, "gap": string, "instructions": "under 120 words", "questions": [string] (3-5), "answer_key": [string] (one per question)}`,
};

// Helper so every emitter builds events the same way.
export function makeEvent(stage, agent, kind, message, extra = {}) {
  return LogEvent.parse({ t: new Date().toISOString(), stage, agent, kind, message, ...extra });
}
