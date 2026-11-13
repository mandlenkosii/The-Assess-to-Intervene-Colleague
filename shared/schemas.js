import { z } from "zod";

export const CriterionScoreSchema = z.object({
  criterion: z.string().min(1),
  score: z.number().int(),
  max_score: z.number().int().positive(),
  evidence: z.string(),
  reason: z.string().min(1)
});

export const MarkSchema = z.object({
  script_id: z.string().min(1),
  scores: z.array(CriterionScoreSchema).min(1),
  total_pct: z.number().min(0).max(100),
  feedback: z.string().min(1),
  attempt: z.number().int().positive().default(1),
  status: z.enum(["ok", "needs_teacher"]).default("ok")
});

export const ReviewSchema = z.object({
  script_id: z.string().min(1),
  verdict: z.enum(["accept", "reject"]),
  reasons: z.array(z.string()),
  blind_total_pct: z.number().min(0).max(100).optional()
});

export const DiagnosisSchema = z.object({
  learner_id: z.string().min(1),
  root_gap: z.string().min(1),
  severity: z.enum(["on_track", "watch", "needs_help"]),
  evidence: z.array(z.string())
});

export const TaskSchema = z.object({
  learner_id: z.string().min(1),
  gap: z.string().min(1),
  instructions: z.string().min(1),
  questions: z.array(z.string()).min(1),
  answer_key: z.array(z.string()).min(1),
  attempt: z.number().int().positive().default(1),
  status: z.enum(["ok", "needs_teacher"]).default("ok")
});

export const LogEventSchema = z.object({
  t: z.string(),
  stage: z.enum(["goal", "plan", "act", "check", "correct", "deliver"]),
  agent: z.enum([
    "planner",
    "marker",
    "calibrator",
    "diagnostician",
    "builder",
    "checker",
    "delivery",
    "teacher"
  ]),
  kind: z.enum([
    "stage",
    "log",
    "mark",
    "review",
    "correction",
    "diagnosis",
    "task",
    "status"
  ]),
  ref: z.string().optional(),
  message: z.string(),
  data: z.record(z.unknown()).optional()
});

export const RunStateSchema = z.object({
  goal: z.string(),
  rubric: z.record(z.unknown()),
  anchors: z.record(MarkSchema),
  scripts: z.record(z.string()),
  marks: z.record(MarkSchema).default({}),
  reviews: z.record(ReviewSchema).default({}),
  diagnoses: z.record(DiagnosisSchema).default({}),
  tasks: z.record(TaskSchema).default({}),
  approved: z.boolean().default(false),
  log: z.array(LogEventSchema).default([])
});

export const promptHints = Object.freeze({
  criterionScore: "criterion, integer score, max_score, exact evidence quote, and reason",
  mark: "script_id, scores (one CriterionScore per rubric criterion), total_pct (computed by code), and 80-150 word feedback",
  review: "script_id, accept/reject verdict, reasons, optional blind_total_pct",
  diagnosis: "learner_id, root_gap, severity (on_track/watch/needs_help), and evidence",
  task: "learner_id, gap, instructions, 3-5 questions, matching answer_key, and attempt",
  logEvent: "timestamp, stage, agent, event kind, optional reference, message, and data"
});
