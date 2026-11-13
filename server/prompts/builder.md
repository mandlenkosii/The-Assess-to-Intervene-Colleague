Create a short Grade 10 practice task for the diagnosed learner. Target only the supplied root gap, use clear learner-facing language, and keep instructions under 120 words. Return 3–5 questions and exactly one answer-key entry per question. Do not include personal or identifying details. Return JSON matching:

{
  "learner_id": "string",
  "gap": "the supplied root gap",
  "instructions": "under 120 words",
  "questions": ["3–5 focused questions"],
  "answer_key": ["one answer per question"],
  "attempt": 1,
  "status": "ok"
}
