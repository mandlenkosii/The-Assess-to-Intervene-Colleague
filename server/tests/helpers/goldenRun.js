// Runs the built-in class end to end on the deterministic fake model (plan → … → approval → delivery in
// preview mode) and returns a normalized copy of everything the run produced. Used by the flag-off
// regression test: the result must match tests/golden/run-output.json, which was captured from main.
import { createRunStore } from "../../runStore.js";
import { loadDemoInputs } from "../../inputs.js";
import { approveRun, runColleague } from "../../orchestrator.js";
import { sendAll } from "../../agents/delivery.js";
import { createFakeLLM } from "../../scripts/fakeLLM.js";

export async function goldenRun(extraDeps = {}) {
  const store = createRunStore({ persist: false });
  const run = store.create(await loadDemoInputs());
  const llm = createFakeLLM();
  // Preview-mode delivery (no SMTP), and no workbook file on disk.
  const agents = { sendAll: (r, opts) => sendAll(r, { ...opts, env: {} }), marksXlsx: null };
  await runColleague(run.id, { store, llm, agents, ...extraDeps });
  const { delivery } = approveRun(run.id, { excluded: ["L003"] }, { store, llm, agents, ...extraDeps });
  await delivery;
  return normalize(run);
}

// Drops what legitimately differs between runs: ids, timestamps and timing stats.
export function normalize(run) {
  const { id, created_at, scripts, log, ...rest } = run;
  const strip = (value) => JSON.parse(JSON.stringify(value, (key, v) => (key === "t" || key === "llm_stats" ? undefined : v)));
  return strip({ ...rest, script_ids: Object.keys(scripts), log });
}
