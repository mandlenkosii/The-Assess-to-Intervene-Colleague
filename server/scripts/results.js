// Writes the measured demo numbers for the pitch close. Run after a real demo run:
//   npm run results                 latest run in runs/ → data/demo-results.json
//   npm run results -- <runId>      a specific run
// A run made with the fake model is a rehearsal: its numbers go to runs/<id>/results.json, never to
// data/demo-results.json, so rehearsal figures can't end up in the pitch.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../env.js";
import { createRunStore } from "../runStore.js";
import { computeResults } from "../results.js";

const runId = process.argv.slice(2).find((a) => !a.startsWith("--"));
const store = createRunStore({ load: true, loadLimit: 200 });
const run = runId ? store.get(runId) : store.latest();
if (!run) {
  console.error(runId ? `results: run ${runId} not found in runs/` : "results: no runs in runs/ yet. Run the demo first (npm run warm or the app).");
  process.exit(1);
}
if (!["awaiting_approval", "delivering", "done"].includes(run.status)) {
  console.error(`results: run ${run.id} is "${run.status}"; it needs to reach the approval gate first.`);
  process.exit(1);
}

const expected = JSON.parse(readFileSync(join(ROOT, "data", "expected.json"), "utf8"));
const r = computeResults(run, expected);
const rehearsal = /^fake|^none|^unknown/.test(r.model);
const out = rehearsal ? join(store.runDir(run.id), "results.json") : join(ROOT, "data", "demo-results.json");
writeFileSync(out, JSON.stringify(r, null, 2) + "\n");

const tick = (ok) => (ok ? "✔" : "✖");
console.log(`results for ${run.id} (${r.model}, status ${run.status})${rehearsal ? "  ⚠ REHEARSAL: do not use these numbers in the pitch" : ""}\n`);
console.log(`  ${tick(r.accuracy.target === null || r.accuracy.within >= r.accuracy.target)} accuracy      ${r.accuracy.within}/${r.accuracy.compared} within ${r.accuracy.tolerance_points} points (target ${r.accuracy.target ?? "–"})`);
console.log(`  ${tick(r.evidence.verbatim === r.evidence.scores)} evidence      ${r.evidence.verbatim}/${r.evidence.scores} criterion scores quote the script verbatim`);
console.log(`  ${tick(r.traps.handled === r.traps.total)} traps         ${r.traps.handled}/${r.traps.total} handled`);
for (const t of r.traps.detail) console.log(`        ${t.handled ? "✔" : "✖"} ${t.script_id} ${t.trap.padEnd(20)} expected ${t.expected_pct}%  first ${t.first_pct}%  final ${t.final_pct}%${t.rejected_by_reviewer ? "  (rejected by reviewer)" : ""}`);
console.log(`    corrections   ${r.corrections.marks_changed} marks changed, ${r.corrections.replans} replan, ${r.corrections.tasks_rebuilt} tasks rebuilt`);
console.log(`    time          ${r.timing_seconds.to_approval ?? "?"}s to approval${r.model_calls ? ` · ${r.model_calls.live} live calls, ${r.model_calls.from_cache} from cache` : ""}`);
console.log("\nfive criteria");
for (const [k, v] of Object.entries(r.criteria)) console.log(`  ${k.padEnd(17)} ${v}`);
console.log(`\nclosing line:\n  "${r.closing_line}"\n\nwritten to ${out}`);
