import { LogEvent, Diagnosis, Review, Task } from "@colleague/shared";
import { buildTask } from "../agents/builder.js";
import { checkTask } from "../agents/checker.js";
import { diagnose } from "../agents/diagnostician.js";

const rubric = {
  criteria: [
    { name: "argument", max_score: 20 },
    { name: "evidence", max_score: 20 },
    { name: "structure", max_score: 20 }
  ]
};

const marks = [
  {
    learner_id: "DEMO-01",
    script_id: "DEMO-01",
    total_pct: 42,
    scores: [
      { criterion: "argument", score: 11, max_score: 20, evidence: "I think it is useful.", reason: "Claim needs development." },
      { criterion: "evidence", score: 7, max_score: 20, evidence: "It helps learners.", reason: "Evidence is too general." },
      { criterion: "structure", score: 8, max_score: 20, evidence: "Firstly", reason: "Paragraph order is unclear." }
    ]
  },
  {
    learner_id: "DEMO-02",
    script_id: "DEMO-02",
    total_pct: 51,
    scores: [
      { criterion: "argument", score: 13, max_score: 20, evidence: "Phones can help with research.", reason: "Some support is present." },
      { criterion: "evidence", score: 10, max_score: 20, evidence: "For example", reason: "Needs a specific example." },
      { criterion: "structure", score: 8, max_score: 20, evidence: "In conclusion", reason: "Ideas need clearer sequencing." }
    ]
  },
  {
    learner_id: "DEMO-03",
    script_id: "DEMO-03",
    total_pct: 76,
    scores: [
      { criterion: "argument", score: 16, max_score: 20, evidence: "A classroom rule should protect learning.", reason: "Clear position." },
      { criterion: "evidence", score: 15, max_score: 20, evidence: "A shared device policy can reduce distraction.", reason: "Relevant support." },
      { criterion: "structure", score: 14, max_score: 20, evidence: "First, schools should", reason: "Mostly clear progression." }
    ]
  }
];

const taskQuestions = [
  "Which specific example would best support your claim, and why?",
  "Add a relevant fact or classroom example to support this statement.",
  "Explain how your example makes the argument more convincing."
];

const emittedEvents = [];
const calls = [];
const ctx = {
  llm: {
    async json(messages, { schema, tier }) {
      calls.push({ schema: schema.description ?? schema.constructor.name, tier });
      if (schema === Diagnosis) {
        const prompt = messages.at(-1).content;
        const learnerId = prompt.match(/^Learner: ([^,\n]+)/m)?.[1];
        const rootGap = prompt.match(/^Lowest criterion: (.+)$/m)?.[1];
        if (!learnerId || !rootGap) throw new Error("Try script could not read the diagnosis prompt");
        return {
          learner_id: learnerId,
          root_gap: rootGap,
          severity: "needs_help",
          evidence: ["mock evidence is replaced with supplied marks"]
        };
      }
      if (schema === Task) {
        const prompt = messages.at(-1).content;
        const diagnosisText = prompt.match(/^Diagnosis: (.+)$/m)?.[1];
        if (!diagnosisText) throw new Error("Try script could not read the builder prompt");
        const diagnosis = JSON.parse(diagnosisText);
        return {
          learner_id: diagnosis.learner_id,
          gap: diagnosis.root_gap,
          instructions: `Practise using relevant ${diagnosis.root_gap} in a short argument.`,
          questions: taskQuestions,
          answer_key: [
            "Choose a concrete example that supports the claim.",
            "Add a fact or example that directly relates to the claim.",
            "Connect the evidence to the claim in a clear sentence."
          ],
          attempt: 1,
          status: "ok"
        };
      }
      if (schema === Review) {
        return { script_id: "demo", verdict: "accept", reasons: [] };
      }
      throw new Error(`Unexpected schema in try script: ${schema?.constructor?.name}`);
    }
  },
  async emit(event) {
    emittedEvents.push(LogEvent.parse(event));
  }
};

const { diagnoses, classGaps } = await diagnose({
  marks,
  rubric,
  plan: { pass_mark: 50, borderline_band: [40, 55] },
  learners: marks.map(({ learner_id }) => ({ learner_id, grade: 10 }))
}, ctx);

const tasks = [];
for (const diagnosis of diagnoses.filter((item) => item.severity !== "on_track")) {
  const task = await buildTask({ diagnosis, rubric }, ctx);
  const review = await checkTask({ task, diagnosis }, ctx);
  if (review.verdict !== "accept") {
    throw new Error(`Practice task for ${diagnosis.learner_id} was rejected: ${review.reasons.join("; ")}`);
  }
  tasks.push({ learner_id: diagnosis.learner_id, gap: task.gap, verdict: review.verdict });
}

console.log(JSON.stringify({
  mode: "mock-llm",
  learners: diagnoses.map(({ learner_id, severity, root_gap }) => ({ learner_id, severity, root_gap })),
  tasks,
  classGaps,
  llmCalls: calls.length,
  emittedEvents: emittedEvents.length
}, null, 2));
