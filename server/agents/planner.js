// Planner: turns the goal + rubric + script list into a Plan.
// Deterministic where it can be (batching, pass mark, band); one model call only when the rubric needs normalising.
import { z } from "zod";
import { Plan } from "@colleague/shared";

const BATCH_SIZE = 5;
const NormalisedCriteria = z.object({
  criteria: z.array(z.object({ name: z.string().min(1), max_score: z.number().int().positive(), descriptor: z.string().optional() })).min(1),
});

export async function plan({ goal, rubric, scriptIds, anchorCount = 0 }, ctx) {
  const emit = (message, data) => ctx.emit?.({ stage: "plan", agent: "planner", kind: "log", message, ...(data ? { data } : {}) });
  emit("Planning the work");

  const criteria = await normaliseCriteria(rubric, ctx, emit);

  const batches = [];
  for (let i = 0; i < scriptIds.length; i += BATCH_SIZE) batches.push(scriptIds.slice(i, i + BATCH_SIZE));

  const pass_mark = Number(rubric?.pass_mark ?? 50);
  const borderline = Array.isArray(rubric?.borderline_band) && rubric.borderline_band.length === 2
    ? rubric.borderline_band.map(Number)
    : [40, 55];

  const result = Plan.parse({ batches, criteria, pass_mark, borderline });

  const total = criteria.reduce((s, c) => s + c.max_score, 0);
  emit(`Rubric: ${criteria.length} criteria (${criteria.map((c) => c.name).join(", ")}), ${total} marks in total`);
  emit(
    `${scriptIds.length} scripts split into ${batches.length} batch${batches.length === 1 ? "" : "es"} of up to ${BATCH_SIZE}; pass mark ${pass_mark}%, borderline band ${borderline[0]}–${borderline[1]}%`,
    { plan: { batches: batches.length, scripts: scriptIds.length, pass_mark, borderline } },
  );
  if (anchorCount) emit(`${anchorCount} teacher-marked anchor script${anchorCount === 1 ? "" : "s"} set aside for calibration`);
  if (goal) emit(`Steps: mark → review against anchors → correct → diagnose → build catch-up tasks → check them → teacher approval → deliver`);
  return result;
}

async function normaliseCriteria(rubric, ctx, emit) {
  // Fast path: rubric.json already in our shape, so no model call needed.
  const direct = NormalisedCriteria.safeParse({
    criteria: (rubric?.criteria ?? []).map((c) => ({
      name: c.name ?? c.criterion,
      max_score: Number(c.max_score ?? c.max),
      descriptor: typeof c.descriptors === "object" ? Object.values(c.descriptors).at(-1) : c.descriptor,
    })),
  });
  if (direct.success) return direct.data.criteria;

  if (!ctx.llm?.json) throw new Error("Rubric is not in a known shape and no model is available to read it");
  emit("Rubric is free-form; reading it with the model");
  const out = await ctx.llm.json([
    { role: "system", content: 'You extract marking criteria from a rubric. Shape: {"criteria": [{"name": short lowercase name, "max_score": integer, "descriptor": one sentence describing top-level work}]}' },
    { role: "user", content: typeof rubric === "string" ? rubric : JSON.stringify(rubric) },
  ], { schema: NormalisedCriteria, tier: "small", temperature: 0 });
  return out.criteria;
}
