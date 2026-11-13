// In-memory runs + persistence (runs/<id>/state.json, log.jsonl) + SSE fan-out.
// One store per process. Everything that changes a run goes through here.
import { randomBytes } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LogEvent } from "@colleague/shared";
import { ROOT } from "./env.js";

export function createRunStore({ dir = join(ROOT, "runs"), persist = true } = {}) {
  const runs = new Map();          // id -> run object
  const subscribers = new Map();   // id -> Set<(event) => void>
  const writeChains = new Map();   // id -> Promise (keeps log.jsonl lines in order)
  const persistTimers = new Map();

  function create(input) {
    const id = `run_${Date.now().toString(36)}_${randomBytes(2).toString("hex")}`;
    const run = {
      id,
      goal: input.goal,
      status: "planning",
      rubric: input.rubric,
      anchors: input.anchors ?? {},
      scripts: input.scripts ?? {},
      learners: input.learners ?? {},
      source_ids: input.source_ids ?? {},   // learner_id -> original script id (e.g. "script_07")
      plan: null,
      marks: {},
      reviews: {},
      diagnoses: {},
      tasks: {},
      brief: null,
      approved: false,
      excluded: [],
      outbox: [],
      log: [],
      created_at: new Date().toISOString(),
    };
    runs.set(id, run);
    subscribers.set(id, new Set());
    if (persist) writeChains.set(id, mkdir(join(dir, id), { recursive: true }).catch(() => {}));
    schedulePersist(id);
    return run;
  }

  const get = (id) => runs.get(id);

  function emit(id, event) {
    const run = runs.get(id);
    if (!run) throw new Error(`Unknown run ${id}`);
    const candidate = { t: new Date().toISOString(), ...event };
    const parsed = LogEvent.safeParse(candidate);
    if (!parsed.success) {
      // Don't kill a run over a contract slip; surface it loudly so the owner fixes it.
      console.warn(`[runStore] event failed LogEvent validation (${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")})`, candidate);
    }
    const ev = parsed.success ? parsed.data : candidate;
    run.log.push(ev);
    if (ev.kind === "status" && ev.data?.status) run.status = ev.data.status;

    for (const send of subscribers.get(id) ?? []) send(ev);
    if (persist) {
      const chain = (writeChains.get(id) ?? Promise.resolve())
        .then(() => appendFile(join(dir, id, "log.jsonl"), JSON.stringify(ev) + "\n"))
        .catch((err) => console.warn(`[runStore] log write failed: ${err.message}`));
      writeChains.set(id, chain);
    }
    schedulePersist(id);
    return ev;
  }

  function setStatus(id, status, { stage = "plan", agent = "planner", message } = {}) {
    return emit(id, { stage, agent, kind: "status", message: message ?? `Status: ${status}`, data: { status } });
  }

  function subscribe(id, send) {
    const set = subscribers.get(id);
    if (!set) return () => {};
    set.add(send);
    return () => set.delete(send);
  }

  function schedulePersist(id) {
    if (!persist) return;
    clearTimeout(persistTimers.get(id));
    persistTimers.set(id, setTimeout(() => flush(id), 500));
  }

  async function flush(id) {
    const run = runs.get(id);
    if (!run || !persist) return;
    clearTimeout(persistTimers.get(id));
    await (writeChains.get(id) ?? Promise.resolve());
    const { log, ...state } = run; // log already lives in log.jsonl
    await writeFile(join(dir, id, "state.json"), JSON.stringify({ ...state, log_events: log.length }, null, 2))
      .catch((err) => console.warn(`[runStore] state write failed: ${err.message}`));
  }

  // Snapshot for GET /runs/:id: everything except full script texts (large and not needed by the UI).
  function snapshot(id) {
    const run = runs.get(id);
    if (!run) return null;
    const { scripts, ...rest } = run;
    return { ...rest, script_count: Object.keys(scripts).length };
  }

  const latest = () => [...runs.values()].at(-1) ?? null;

  return { create, get, emit, setStatus, subscribe, flush, snapshot, latest };
}
