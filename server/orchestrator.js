// The colleague's control loop. v1 (phase 1): goal → plan → mark the first script → stop.
// Loop 1 (phase 2) and Loop 2 + approval (phase 3) build on this file.
import { existsSync } from "node:fs";
import { plan as defaultPlanner } from "./agents/planner.js";

// Agents owned by teammates are loaded lazily so the spine runs even before their PRs land.
async function loadAgent(path, name) {
  const url = new URL(path, import.meta.url);
  if (!existsSync(url)) return null;
  const mod = await import(url.href);
  return mod[name] ?? null;
}

export async function loadAgents() {
  return {
    plan: defaultPlanner,
    markScript: await loadAgent("./agents/marker.js", "markScript"),
  };
}

/**
 * Runs a colleague job end to end. Never throws: failures end the run with status "error".
 * @param {string} runId
 * @param {{ store: ReturnType<import('./runStore.js').createRunStore>, llm: any, agents?: any }} deps
 */
export async function runColleague(runId, { store, llm, agents }) {
  const run = store.get(runId);
  const emit = (event) => store.emit(runId, event);
  const ctx = { llm, emit, run };
  const status = (s, stage, agent, message) => store.setStatus(runId, s, { stage, agent, message });

  try {
    agents ??= await loadAgents();
    const scriptIds = Object.keys(run.scripts);
    if (!scriptIds.length) throw new Error("No scripts to mark");

    // GOAL
    status("planning", "goal", "teacher", "Run started");
    emit({ stage: "goal", agent: "teacher", kind: "log", message: `Goal: ${run.goal}` });

    // PLAN
    run.plan = await agents.plan({ goal: run.goal, rubric: run.rubric, scriptIds, anchorCount: Object.keys(run.anchors).length }, ctx);

    // ACT (thin slice: first script only)
    if (!agents.markScript) {
      emit({ stage: "act", agent: "marker", kind: "error", message: "Marker agent isn't available yet (server/agents/marker.js). Plan is ready." });
      status("done", "act", "planner", "Stopped after planning: no Marker agent");
      return;
    }
    status("marking", "act", "marker", `Marking batch 1 of ${run.plan.batches.length}`);
    const first = run.plan.batches[0][0];
    const rubric = { ...run.rubric, criteria: run.plan.criteria };
    const mark = await agents.markScript({
      scriptId: first,
      text: run.scripts[first],
      rubric,
      anchors: Object.values(run.anchors),
      feedback: [],
      attempt: 1,
    }, ctx);
    run.marks[first] = mark;

    status("done", "act", "marker", `Thin slice complete: ${first} marked with evidence (1 of ${scriptIds.length})`);
  } catch (err) {
    console.error(`[orchestrator] ${runId} failed:`, err);
    emit({ stage: "act", agent: "planner", kind: "error", message: `Run stopped: ${err.message}` });
    status("error", "act", "planner", "Run stopped with an error");
  } finally {
    await store.flush(runId);
  }
}
