import { z } from "zod";

export const CriterionScore = z.object({
  criterion: z.string().min(1),
  score: z.number().finite(),
  max_score: z.number().positive(),
  evidence: z.string(),
  reason: z.string()
});

export const Mark = z.object({
  script_id: z.string().min(1),
  scores: z.array(CriterionScore),
  total_pct: z.number().min(0).max(100),
  feedback: z.string(),
  attempt: z.number().int().positive().default(1),
  status: z.enum(["ok", "needs_teacher"]).default("ok")
});

export const Review = z.object({
  script_id: z.string().min(1),
  verdict: z.enum(["accept", "reject"]),
  reasons: z.array(z.string()),
  blind_total_pct: z.number().min(0).max(100).optional()
});

export const Diagnosis = z.object({
  learner_id: z.string().min(1),
  root_gap: z.string(),
  severity: z.enum(["on_track", "watch", "needs_help"]),
  evidence: z.array(z.string())
});

export const Task = z.object({
  learner_id: z.string().min(1),
  gap: z.string(),
  instructions: z.string(),
  questions: z.array(z.string()),
  answer_key: z.array(z.string()),
  attempt: z.number().int().positive().default(1),
  status: z.enum(["ok", "needs_teacher"]).default("ok")
});

export const BriefSummary = z.object({
  summary: z.string()
});

export const LogEvent = z.object({
  t: z.string(),
  stage: z.enum(["goal", "plan", "act", "check", "correct", "deliver"]),
  agent: z.string(),
  kind: z.string(),
  ref: z.string().optional(),
  message: z.string(),
  data: z.record(z.string(), z.unknown()).optional()
});

export const RunState = z.object({
  id: z.string().optional(),
  status: z.string(),
  goal: z.string(),
  rubric: z.record(z.string(), z.unknown()),
  marks: z.record(z.string(), Mark).default({}),
  diagnoses: z.array(Diagnosis).default([]),
  tasks: z.record(z.string(), Task).default({}),
  approved: z.boolean().default(false),
  log: z.array(LogEvent).default([])
});

export const promptHints = {
  CriterionScore: "criterion, numeric score and max_score, exact evidence quote, and reason.",
  Mark: "script_id, criterion scores, code-computed percentage, learner feedback, attempt, and status.",
  Review: "script_id, accept/reject verdict, reasons, optional blind percentage.",
  Diagnosis: "learner_id, root_gap, severity (on_track/watch/needs_help), and evidence quotes.",
  Task: "learner_id, diagnosed gap, instructions, questions, matching answer key, attempt, and status.",
  BriefSummary: "one short, teacher-facing summary paragraph based only on computed brief facts.",
  LogEvent: "timestamp, six-stage pipeline stage, agent, event kind, optional reference, message, and data."
};
