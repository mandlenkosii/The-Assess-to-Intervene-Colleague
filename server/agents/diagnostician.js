import { Diagnosis, promptHints } from "@colleague/shared";

const asArray = (value) => Array.isArray(value) ? value : Object.values(value ?? {});

function scoreOf(mark) {
  if (Number.isFinite(mark.total_pct)) return mark.total_pct;
  const maximum = mark.scores.reduce((sum, score) => sum + score.max_score, 0);
  return maximum > 0
    ? mark.scores.reduce((sum, score) => sum + score.score, 0) / maximum * 100
    : 0;
}

function weakestGap(mark) {
  const weakest = [...mark.scores].sort((a, b) => (
    a.score / a.max_score - b.score / b.max_score
  ))[0];
  return weakest?.criterion ?? "using evidence to support ideas";
}

export async function diagnose({ marks, rubric, plan = {}, learners = [] }, ctx) {
  const markList = asArray(marks);
  const learnerById = new Map(learners.map((learner) => [learner.learner_id, learner]));
  const passMark = plan.pass_mark ?? 50;
  const [borderLow, borderHigh] = plan.borderline_band ?? [40, 55];
  const criterionTotals = new Map();

  for (const mark of markList) {
    for (const score of mark.scores) {
      const current = criterionTotals.get(score.criterion) ?? { earned: 0, possible: 0 };
      current.earned += score.score;
      current.possible += score.max_score;
      criterionTotals.set(score.criterion, current);
    }
  }

  const classGaps = [...criterionTotals.entries()]
    .map(([criterion, totals]) => ({
      criterion,
      average_pct: totals.possible ? totals.earned / totals.possible * 100 : 0
    }))
    .sort((a, b) => a.average_pct - b.average_pct)
    .slice(0, 2);

  const diagnoses = await Promise.all(markList.map(async (mark) => {
    const learnerId = mark.learner_id ?? mark.script_id;
    if (!learnerId) throw new Error("Cannot diagnose a mark without learner_id or script_id");

    const percent = scoreOf(mark);
    const severity = percent < passMark
      ? "needs_help"
      : percent >= borderLow && percent <= borderHigh ? "watch" : "on_track";
    const rootGap = weakestGap(mark);
    const suppliedEvidence = mark.scores
      .filter((score) => score.criterion === rootGap && score.evidence)
      .map((score) => score.evidence);
    const learner = learnerById.get(learnerId);

    if (severity === "on_track") {
      return Diagnosis.parse({
        learner_id: learnerId,
        root_gap: rootGap,
        severity,
        evidence: suppliedEvidence
      });
    }

    if (!ctx?.llm?.json) {
      throw new Error("Diagnostician requires ctx.llm.json for learners who need support");
    }

    const result = await ctx.llm.json([
      {
        role: "system",
        content: `Return only JSON, exactly this shape: ${promptHints.Diagnosis}. Use supplied marks as the only source of evidence.`
      },
      {
        role: "user",
        content: [
          `Learner: ${learnerId}${learner ? `, grade ${learner.grade}` : ""}`,
          `Severity (computed in code): ${severity}`,
          `Lowest criterion: ${rootGap}`,
          `Rubric: ${JSON.stringify(rubric)}`,
          `Marks and evidence: ${JSON.stringify(mark.scores)}`
        ].join("\n")
      }
    ], { schema: Diagnosis, tier: "large", temperature: 0.2 });

    const parsed = Diagnosis.parse({ ...result, learner_id: learnerId, severity });
    return { ...parsed, evidence: suppliedEvidence };
  }));

  if (ctx?.emit) {
    await ctx.emit({
      t: new Date().toISOString(),
      stage: "act",
      agent: "diagnostician",
      kind: "diagnoses",
      message: `Diagnosed ${diagnoses.length} learners; class gaps: ${classGaps.map((gap) => gap.criterion).join(", ") || "none"}`,
      data: { diagnoses, classGaps }
    });
  }

  return { diagnoses, classGaps };
}
