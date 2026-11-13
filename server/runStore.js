// In-memory runs + persistence (runs/<id>/state.json, log.jsonl) + SSE fan-out.
// One store per process. Everything that changes a run goes through here.
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LogEvent } from "@colleague/shared";
import { ROOT } from "./env.js";

// Statuses that mean work was still in progress. After a restart that work is gone, so the run is marked interrupted.
const IN_FLIGHT = new Set(["planning", "marking", "reviewing", "intervening", "delivering"]);

/**
 * @param {{ dir?: string, persist?: boolean, load?: boolean, loadLimit?: number }} [opts]
 *   load: read the most recent runs back from disk on startup (so a warmed demo run survives a restart).
 */
export function createRunStore({ dir = join(ROOT, "runs"), persist = true, load = false, loadLimit = 20 } = {}) {
  const runs = new Map();          // id -> run object
  const subscribers = new Map();   // id -> Set<(event) => void>
  const writeChains = new Map();   // id -> Promise (keeps log.jsonl lines in order)
  const persistTimers = new Map();

  if (load && persist) loadFromDisk();

  function loadFromDisk() {
    if (!existsSync(dir)) return;
    const found = [];
    for (const id of readdirSync(dir)) {
      try {
        const state = JSON.parse(readFileSync(join(dir, id, "state.json"), "utf8"));
        const logFile = join(dir, id, "log.jsonl");
        const log = existsSync(logFile)
          ? readFileSync(logFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
          : [];
        delete state.log_events;
        found.push({ ...state, log });
      } catch { /* half-written or foreign folder: skip */ }
    }
    found.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    for (const run of found.slice(-loadLimit)) {
      runs.set(run.id, run);
      subscribers.set(run.id, new Set());
      if (IN_FLIGHT.has(run.status)) {
        emit(run.id, { stage: "act", agent: "planner", kind: "error", message: "The server restarted during this run, so it was interrupted. Start a new run." });
        setStatus(run.id, "error", { stage: "act", agent: "planner", message: "Run interrupted by a server restart" });
      }
    }
  }

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

  const latest = () => [...runs.values()].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).at(-1) ?? null;
  const runDir = (id) => (persist ? join(dir, id) : null);

  return { create, get, emit, setStatus, subscribe, flush, snapshot, latest, runDir };
}
