// The colleague's control loop.
//   GOAL → PLAN → for each batch: MARK (parallel) → CHECK (Reviewer) → CORRECT (re-mark rejected / replan on drift)
// Phase 2 ends after Loop 1. Loop 2 + the approval gate (phase 3) continue from `afterMarking`.
import { existsSync } from "node:fs";
import pLimit from "p-limit";
import { env } from "./env.js";
import { plan as defaultPlanner, recalibrate as defaultRecalibrate } from "./agents/planner.js";

export const MAX_ATTEMPTS = 3;          // first mark + 2 re-marks, then "needs teacher"
export const MAX_REPLANS = 1;           // run-level guard against recalibration loops
export const RUN_TIMEOUT_MS = 12 * 60 * 1000;

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
    recalibrate: defaultRecalibrate,
    markScript: await loadAgent("./agents/marker.js", "markScript"),
    reviewBatch: await loadAgent("./agents/calibrator.js", "reviewBatch"),
  };
}

class Aborted extends Error {}
const pct = (n) => `${Math.round(n)}%`;

/**
 * Runs a colleague job end to end. Never throws: failures end the run with status "error".
 * @param {string} runId
 * @param {{ store: any, llm: any, agents?: any, concurrency?: number, timeoutMs?: number }} deps
 */
export async function runColleague(runId, { store, llm, agents, concurrency = env.CONCURRENCY, timeoutMs = RUN_TIMEOUT_MS }) {
  const run = store.get(runId);
  let aborted = false;
  // After a timeout, late results from in-flight model calls must not touch the run.
  const emit = (event) => (aborted ? null : store.emit(runId, event));
  const status = (s, stage, agent, message) => (aborted ? null : store.setStatus(runId, s, { stage, agent, message }));
  const ctx = { llm, emit, run };
  const limit = pLimit(Math.max(1, concurrency));
  const guard = () => { if (aborted) throw new Aborted(); };

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Run took longer than ${Math.round(timeoutMs / 60000) || "<1"} min and was stopped`)), timeoutMs);
  });

  try {
    agents = { ...(await loadAgents()), ...(agents ?? {}) };
    await Promise.race([pipeline(), timeout]);
  } catch (err) {
    if (!(err instanceof Aborted)) {
      if (!aborted) console.error(`[orchestrator] ${runId} failed:`, err);
      emit({ stage: "act", agent: "planner", kind: "error", message: `Run stopped: ${err.message}` });
      status("error", "act", "planner", "Run stopped with an error");
    }
    aborted = true;
  } finally {
    clearTimeout(timer);
    await store.flush(runId);
  }

  async function pipeline() {
    const scriptIds = Object.keys(run.scripts);
    if (!scriptIds.length) throw new Error("No scripts to mark");

    // GOAL
    status("planning", "goal", "teacher", "Run started");
    emit({ stage: "goal", agent: "teacher", kind: "log", message: `Goal: ${run.goal}` });

    // PLAN
    run.plan = await agents.plan({ goal: run.goal, rubric: run.rubric, scriptIds, anchorCount: Object.keys(run.anchors).length }, ctx);
    guard();

    if (!agents.markScript) {
      emit({ stage: "act", agent: "marker", kind: "error", message: "Marker agent isn't available yet (server/agents/marker.js). Plan is ready." });
      status("done", "act", "planner", "Stopped after planning: no Marker agent");
      return;
    }

    // ACT + CHECK + CORRECT, batch by batch (Loop 1)
    const batches = run.plan.batches;
    let anchorsChecked = false;
    for (const [i, batch] of batches.entries()) {
      status("marking", "act", "marker", `Marking batch ${i + 1} of ${batches.length} (${batch.length} scripts)`);
      await Promise.all(batch.map((id) => limit(() => markOne(id, 1, run.plan.calibration_note ? [run.plan.calibration_note] : []))));
      guard();

      if (agents.reviewBatch) {
        status("reviewing", "check", "calibrator", `Reviewing batch ${i + 1} of ${batches.length}`);
        await reviewLoop(batch, { checkAnchors: !anchorsChecked });
        anchorsChecked = true;
      }
      await store.flush(runId); // persist after every batch
    }
    if (!agents.reviewBatch) {
      emit({ stage: "check", agent: "calibrator", kind: "error", message: "Reviewer agent isn't available yet (server/agents/calibrator.js); marks are unchecked." });
    }

    await afterMarking();
  }

  // One script, with retries if the Marker itself fails (bad JSON twice, feedback too long, …).
  async function markOne(id, attempt, feedback) {
    for (let a = attempt; a <= MAX_ATTEMPTS; a++) {
      guard();
      try {
        const mark = await agents.markScript({
          scriptId: id,
          text: run.scripts[id],
          rubric: rubricForAgents(),
          anchors: Object.values(run.anchors),
          feedback,
          attempt: a,
        }, ctx);
        guard();
        run.marks[id] = mark;
        return mark;
      } catch (err) {
        if (err instanceof Aborted) throw err;
        emit({ stage: "act", agent: "marker", kind: "error", ref: id, message: `${id}: marking attempt ${a} failed (${err.message})` });
        feedback = [...feedback, `Your previous attempt failed validation: ${err.message}`];
      }
    }
    const previous = run.marks[id];
    if (previous) {
      // A re-mark failed: keep the last good mark but don't let it go out unchecked.
      run.marks[id] = { ...previous, status: "needs_teacher" };
    } else {
      run.unmarked = [...new Set([...(run.unmarked ?? []), id])];
    }
    emit({
      stage: "correct", agent: "marker", kind: "correction", ref: id,
      message: `${id}: could not be ${previous ? "re-marked" : "marked"} after ${MAX_ATTEMPTS} attempts, needs teacher`,
      data: { route: "marker", status: "needs_teacher", attempt: MAX_ATTEMPTS, reasons: ["Marker failed repeatedly"], before: previous?.total_pct ?? null, after: previous?.total_pct ?? null },
    });
    return null;
  }

  async function reviewLoop(batch, { checkAnchors }) {
    let pending = batch.filter((id) => run.marks[id]);
    while (pending.length) {
      guard();
      const { reviews = [], drift = {} } = await agents.reviewBatch({
        marks: pick(run.marks, pending),
        scripts: pick(run.scripts, pending),
        anchors: run.anchors,
        rubric: rubricForAgents(),
        plan: { ...run.plan, borderline_band: run.plan.borderline },
        checkAnchors,
      }, ctx);
      guard();
      checkAnchors = false;
      for (const r of reviews) run.reviews[r.script_id] = r;

      // Drift → back to the Planner (once per run), then re-mark the whole batch with the calibration note.
      if (drift.flag && (run.plan.replans ?? 0) < MAX_REPLANS) {
        run.plan = agents.recalibrate(run.plan, drift, ctx);
        const ids = batch.filter((id) => run.marks[id] && run.marks[id].status !== "needs_teacher" && run.marks[id].attempt < MAX_ATTEMPTS);
        const results = await Promise.all(ids.map((id) => limit(() => remark(id, [run.plan.calibration_note], "planner"))));
        guard();
        const changed = results.filter((r) => r && r.after !== r.before).length;
        emit({
          stage: "correct", agent: "planner", kind: "log",
          message: `Batch re-marked after recalibration: ${changed} mark${changed === 1 ? "" : "s"} changed, ${ids.length - changed} confirmed`,
        });
        pending = ids;
        checkAnchors = true; // confirm the recalibration against the anchors
        continue;
      }
      if (drift.flag) {
        emit({ stage: "check", agent: "calibrator", kind: "log", message: `Drift still flagged (${drift.reason}); replan limit reached, continuing` });
      }

      // Rejected → back to the Marker with the reasons, until accepted or out of attempts.
      const next = [];
      for (const r of reviews.filter((x) => x.verdict === "reject")) {
        const mark = run.marks[r.script_id];
        if (!mark) continue;
        if (mark.attempt >= MAX_ATTEMPTS) {
          run.marks[r.script_id] = { ...mark, status: "needs_teacher" };
          emit({
            stage: "correct", agent: "calibrator", kind: "correction", ref: r.script_id,
            message: `${r.script_id}: still disputed after ${mark.attempt} attempts, flagged needs teacher`,
            data: { route: "marker", status: "needs_teacher", before: mark.total_pct, after: mark.total_pct, reasons: r.reasons, attempt: mark.attempt },
          });
        } else {
          next.push(r);
        }
      }
      await Promise.all(next.map((r) => limit(() => remark(r.script_id, r.reasons, "marker"))));
      pending = next.map((r) => r.script_id).filter((id) => run.marks[id]?.status !== "needs_teacher");
    }
  }

  // Re-marks one script with feedback. Emits a correction only when the mark actually changed
  // (a reviewer rejection is always shown, because the reviewer's reasons are the evidence).
  async function remark(id, reasons, route) {
    const before = run.marks[id];
    const after = await markOne(id, before.attempt + 1, reasons);
    if (!after) return null;
    const changed = after.total_pct !== before.total_pct;
    if (route === "marker" || changed) {
      const why = route === "planner" ? "recalibrated against the teacher's anchors" : short(reasons[0] ?? "reviewer feedback");
      emit({
        stage: "correct", agent: route === "planner" ? "planner" : "calibrator", kind: "correction", ref: id,
        message: `${id}: ${pct(before.total_pct)} → ${pct(after.total_pct)} after re-mark (${why})`,
        data: { route, before: before.total_pct, after: after.total_pct, reasons, attempt: after.attempt },
      });
    }
    return { before: before.total_pct, after: after.total_pct };
  }

  async function afterMarking() {
    const marks = Object.values(run.marks);
    const corrected = new Set(run.log
      .filter((e) => e.kind === "correction" && e.ref && typeof e.data?.after === "number" && e.data.after !== e.data.before)
      .map((e) => e.ref)).size;
    const needsTeacher = marks.filter((m) => m.status === "needs_teacher").length + (run.unmarked?.length ?? 0);
    const summary = `Marking complete: ${marks.length} of ${Object.keys(run.scripts).length} marked, ${corrected} corrected, ${needsTeacher} need${needsTeacher === 1 ? "s" : ""} teacher, ${run.plan.replans ?? 0} replan${run.plan.replans === 1 ? "" : "s"}`;
    emit({ stage: "check", agent: "calibrator", kind: "log", message: summary, data: { marked: marks.length, corrected, needsTeacher, replans: run.plan.replans ?? 0 } });
    // Phase 3 continues here: diagnose → build tasks → check them → awaiting_approval.
    status("done", "check", "calibrator", summary);
  }

  function rubricForAgents() {
    return { ...(typeof run.rubric === "object" ? run.rubric : {}), criteria: run.plan.criteria };
  }
}

const short = (s, n = 110) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const pick = (obj, ids) => Object.fromEntries(ids.filter((id) => id in obj).map((id) => [id, obj[id]]));
