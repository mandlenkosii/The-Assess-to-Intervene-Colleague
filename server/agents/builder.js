import { Task, promptHints } from "@colleague/shared";

export async function buildTask({ diagnosis, rubric, feedback = "", attempt = 1 }, ctx) {
  if (!diagnosis?.learner_id || !diagnosis.root_gap) {
    throw new Error("Task builder requires a learner diagnosis with a root_gap");
  }
  if (!ctx?.llm?.json) {
    throw new Error("Task builder requires ctx.llm.json");
  }

  const result = await ctx.llm.json([
    {
      role: "system",
      content: `Build a Grade 10 practice task targeted only to the supplied diagnosis. Return only JSON, exactly this shape: ${promptHints.Task}`
    },
    {
      role: "user",
      content: [
        `Diagnosis: ${JSON.stringify(diagnosis)}`,
        `Rubric: ${JSON.stringify(rubric)}`,
        `Checker feedback from the previous attempt: ${feedback || "None"}`
      ].join("\n")
    }
  ], { schema: Task, tier: "large", temperature: 0.3 });

  const task = Task.parse({
    ...result,
    learner_id: diagnosis.learner_id,
    gap: diagnosis.root_gap,
    attempt,
    status: "ok"
  });
  if (task.questions.length < 3 || task.questions.length > 5) {
    throw new Error("Generated practice task must contain 3–5 questions");
  }
  if (task.answer_key.length !== task.questions.length) {
    throw new Error("Generated practice task must have one answer per question");
  }
  if (task.instructions.trim().split(/\s+/).filter(Boolean).length >= 120) {
    throw new Error("Generated practice task instructions must be under 120 words");
  }

  await ctx.emit?.({
    t: new Date().toISOString(),
    stage: "act",
    agent: "builder",
    kind: "task",
    ref: diagnosis.learner_id,
    message: `Built a practice task for ${diagnosis.root_gap}`,
    data: { task }
  });
  return task;
}
