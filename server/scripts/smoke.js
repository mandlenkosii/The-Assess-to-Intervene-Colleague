// Headless end-to-end run of the demo class with timings. Run: npm run smoke [-- --fake] [-- --approve]
//   --fake      use the deterministic fake model (no API keys, no rate limits)
//   --approve   approve automatically at the gate and run delivery (emails go only to real addresses in learners.csv)
//   --latency=N fake model latency in ms per call (default 0), to see how concurrency behaves
import { performance } from "node:perf_hooks";
import { createLLM } from "../llm.js";
import { createRunStore } from "../runStore.js";
import { loadDemoInputs } from "../inputs.js";
import { approveRun, runColleague } from "../orchestrator.js";
import { env } from "../env.js";
import { createFakeLLM } from "./fakeLLM.js";

const args = process.argv.slice(2);
const fake = args.includes("--fake");
const approve = args.includes("--approve");
const latencyMs = Number(args.find((a) => a.startsWith("--latency="))?.split("=")[1] ?? 0);

const llm = fake ? createFakeLLM({ latencyMs }) : createLLM({ log: () => {} });
const store = createRunStore();
const run = store.create(await loadDemoInputs());

// Time spent in each status, from the status events.
const spans = [];
let current = null;
const t0 = performance.now();
store.subscribe(run.id, (ev) => {
  if (ev.kind === "status" && ev.data?.status && ev.data.status !== current?.status) {
    const now = performance.now();
    if (current) current.ms = now - current.start;
    current = { status: ev.data.status, start: now };
    spans.push(current);
  }
  if (ev.kind === "correction" || ev.kind === "error") console.log(`  ${ev.kind === "error" ? "!" : "↺"} ${ev.message}`);
});

console.log(`smoke: ${fake ? `fake model${latencyMs ? ` (${latencyMs}ms/call)` : ""}` : `Groq ${env.GROQ_MODEL_LARGE}`} · concurrency ${env.CONCURRENCY} · run ${run.id}`);
await runColleague(run.id, { store, llm });

if (approve && run.status === "awaiting_approval") {
  const { delivery } = approveRun(run.id, {}, { store, llm });
  await delivery;
}
if (current) current.ms = performance.now() - current.start;
const total = performance.now() - t0;

const marks = Object.values(run.marks);
const tasks = Object.values(run.tasks);
const corrections = run.log.filter((e) => e.kind === "correction");
const s = llm.stats ?? {};
const sec = (ms) => `${(ms / 1000).toFixed(1)}s`;

// Statuses repeat per batch (marking → reviewing → marking …), so total them per stage.
const byStage = new Map();
for (const sp of spans) byStage.set(sp.status, (byStage.get(sp.status) ?? 0) + (sp.ms ?? 0));
console.log("\nstage timings");
for (const [stage, ms] of byStage) console.log(`  ${stage.padEnd(18)} ${sec(ms).padStart(7)}`);
console.log(`  ${"total".padEnd(18)} ${sec(total).padStart(7)}`);
console.log("\nresult");
console.log(`  status            ${run.status}`);
console.log(`  marked            ${marks.length}/${Object.keys(run.scripts).length} (${marks.filter((m) => m.attempt > 1).length} re-marked, ${marks.filter((m) => m.status === "needs_teacher").length} need teacher)`);
console.log(`  diagnosed         ${Object.keys(run.diagnoses).length} (${Object.values(run.diagnoses).filter((d) => d.severity !== "on_track").length} need a task)`);
console.log(`  tasks             ${tasks.length} (${tasks.filter((t) => t.attempt > 1).length} rebuilt, ${tasks.filter((t) => t.status === "needs_teacher").length} need teacher)`);
console.log(`  corrections       ${corrections.length} events (${run.plan?.replans ?? 0} replan)`);
if (run.outbox?.length) console.log(`  emails            ${["sent", "failed", "skipped"].map((k) => `${run.outbox.filter((m) => m.status === k).length} ${k}`).join(", ")}`);
console.log("\nmodel");
console.log(`  calls             ${s.calls ?? "?"}${s.byAgent ? `  ${JSON.stringify(s.byAgent)}` : ""}`);
console.log(`  cache hits        ${s.cacheHits ?? 0}`);
console.log(`  fallbacks/repairs ${s.fallbacks ?? 0}/${s.repairs ?? 0}   429 retries ${s.retries429 ?? 0}`);
if (s.ms && s.calls) console.log(`  avg call          ${Math.round(s.ms / s.calls)}ms`);
const slowest = [...byStage].filter(([k]) => k !== "awaiting_approval").sort((a, b) => b[1] - a[1])[0];
if (slowest) console.log(`\nslowest stage: ${slowest[0]} (${sec(slowest[1])})`);
console.log(`saved to runs/${run.id}/`);
process.exit(run.status === "error" ? 1 : 0);
