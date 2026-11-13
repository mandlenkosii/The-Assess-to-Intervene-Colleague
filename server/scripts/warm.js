// Warms the model cache for the demo: runs the demo class twice and checks the second run is fast and fully cached.
//   npm run warm              real models (needs GROQ_API_KEY / GEMINI_API_KEY); fills .cache/
//   npm run warm -- --fake    rehearsal with the fake model through the real cache code; uses .cache/rehearsal/
// Both runs stop at the approval gate and are saved to runs/, so the server can reopen the warmed run (GET /api/runs/latest).
import { performance } from "node:perf_hooks";
import { join } from "node:path";
import { CACHE_DIR, createLLM } from "../llm.js";
import { createRunStore } from "../runStore.js";
import { loadDemoInputs } from "../inputs.js";
import { runColleague } from "../orchestrator.js";
import { env } from "../env.js";
import { createFakeTransport } from "./fakeLLM.js";

const fake = process.argv.includes("--fake");
const TARGET_MS = 60_000;
const TARGET_HIT_RATE = 0.95;

if (!fake && !env.GROQ_API_KEY && !env.GEMINI_API_KEY) {
  console.error("warm: no GROQ_API_KEY or GEMINI_API_KEY in .env. Add keys, or rehearse with: npm run warm -- --fake");
  process.exit(1);
}

const store = createRunStore();
const inputs = await loadDemoInputs();
const options = fake
  ? { transport: createFakeTransport({ latencyMs: 150 }), cacheDir: join(CACHE_DIR, "rehearsal") }
  : { log: (m) => console.log(`  ${m}`) };

async function once(label) {
  const llm = createLLM(options); // fresh stats per run; the disk cache is shared
  const run = store.create(inputs);
  const t0 = performance.now();
  await runColleague(run.id, { store, llm });
  const ms = performance.now() - t0;
  const { calls, cacheHits } = llm.stats;
  const requests = calls + cacheHits;
  const hitRate = requests ? cacheHits / requests : 0;
  console.log(`${label}: ${(ms / 1000).toFixed(1)}s · status ${run.status} · ${requests} model requests, ${cacheHits} from cache (${Math.round(hitRate * 100)}%), ${calls} live calls · run ${run.id}`);
  return { run, ms, hitRate };
}

console.log(`warm: ${fake ? "fake model (rehearsal)" : `Groq ${env.GROQ_MODEL_LARGE}`} · concurrency ${env.CONCURRENCY}`);
const first = await once("run 1 (fills cache)");
if (first.run.status === "error") { console.error("warm: run 1 failed; fix that before the demo."); process.exit(1); }
const second = await once("run 2 (from cache)");

const fast = second.ms < TARGET_MS;
const cached = second.hitRate >= TARGET_HIT_RATE;
console.log(`\n${fast ? "✔" : "✖"} second run under ${TARGET_MS / 1000}s   ${cached ? "✔" : "✖"} ≥${TARGET_HIT_RATE * 100}% cache hits`);
if (fast && cached) console.log(`Demo ready: start the server and open /?run=${second.run.id} (or "Open last run" on the start screen).`);
process.exit(fast && cached && second.run.status === "awaiting_approval" ? 0 : 1);
