import { Review, Task } from "@colleague/shared";

export async function checkTask({ task, diagnosis }, ctx) {
  const reasons = [];
  const parsedTask = Task.safeParse(task);
  if (!parsedTask.success) {
    throw new Error(`Practice task is invalid: ${parsedTask.error.message}`);
  }
  if (task.gap.trim().toLocaleLowerCase() !== diagnosis.root_gap.trim().toLocaleLowerCase()) {
    reasons.push("Task gap does not match the diagnosed root gap.");
  }
  if (task.questions.length < 3 || task.questions.length > 5) {
    reasons.push("Task must contain 3–5 questions.");
  }
  if (task.answer_key.length !== task.questions.length) {
    reasons.push("Task must have one answer per question.");
  }
  if (task.instructions.trim().split(/\s+/).filter(Boolean).length >= 120) {
    reasons.push("Instructions must be under 120 words.");
  }

  if (reasons.length === 0) {
    if (!ctx?.llm?.json) throw new Error("Practice checker requires ctx.llm.json");
    const modelReview = Review.parse(await ctx.llm.json([
      {
        role: "system",
        content: "Check that the task is suitable for Grade 10 and directly targets the diagnosed gap. Return only JSON."
      },
      {
        role: "user",
        content: `Diagnosis: ${JSON.stringify(diagnosis)}\nTask: ${JSON.stringify(task)}`
      }
    ], { schema: Review, tier: "large", temperature: 0 }));
    if (modelReview.verdict === "reject") reasons.push(...modelReview.reasons);
  }

  const review = Review.parse({
    script_id: diagnosis.learner_id,
    verdict: reasons.length ? "reject" : "accept",
    reasons
  });
  await ctx.emit?.({
    t: new Date().toISOString(),
    stage: "check",
    agent: "checker",
    kind: "task_review",
    ref: diagnosis.learner_id,
    message: review.verdict === "accept"
      ? `Practice task accepted for ${diagnosis.learner_id}`
      : `Practice task rejected for ${diagnosis.learner_id}: ${reasons.join("; ")}`,
    data: { review }
  });
  return review;
}
