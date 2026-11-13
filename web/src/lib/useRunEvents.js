// Follows one run over SSE and reduces its events into the `run` object App renders.
// Events are buffered and applied once per animation frame, so a burst of 100 events causes one render.
import { useEffect, useRef, useState } from "react";

export function emptyRun(id = null) {
  return {
    id, status: "planning", log: [], marks: {}, reviews: {}, corrections: [],
    diagnoses: {}, classGaps: [], tasks: {}, learners: {}, outbox: [],
    approved: false, activeAgent: null, plan: null,
  };
}

// Pure reducer: (run, event) → run. Mutates a shallow copy made once per frame in applyEvents.
function applyEvent(run, ev) {
  run.log.push(ev);
  if (ev.agent && ev.agent !== "teacher") run.activeAgent = ev.agent;
  const d = ev.data ?? {};
  switch (ev.kind) {
    case "status":
      if (d.status) run.status = d.status;
      if (d.status === "delivering" || d.status === "done") run.approved = run.approved || d.status === "delivering";
      break;
    case "mark":
      if (d.mark) run.marks[d.mark.script_id ?? ev.ref] = d.mark;
      break;
    case "review":
    case "task_review":
      if (d.review) run.reviews[`${ev.agent}:${d.review.script_id ?? ev.ref}`] = d.review;
      break;
    case "correction":
      run.corrections.push(ev);
      break;
    case "diagnosis":
      if (d.diagnosis) run.diagnoses[d.diagnosis.learner_id] = d.diagnosis;
      break;
    case "diagnoses":
      for (const dg of d.diagnoses ?? []) run.diagnoses[dg.learner_id] = dg;
      if (d.classGaps) run.classGaps = d.classGaps;
      break;
    case "task":
      if (d.task) run.tasks[d.task.learner_id] = d.task;
      break;
    case "email":
      run.outbox.push(d.email ?? { ...d, message: ev.message });
      break;
    default:
      if (d.plan) run.plan = d.plan;
      if (d.email) run.outbox.push(d.email);
  }
  return run;
}

export function applyEvents(run, events) {
  const next = {
    ...run,
    log: [...run.log], marks: { ...run.marks }, reviews: { ...run.reviews }, corrections: [...run.corrections],
    diagnoses: { ...run.diagnoses }, tasks: { ...run.tasks }, outbox: [...run.outbox],
  };
  for (const ev of events) applyEvent(next, ev);
  return next;
}

/**
 * @param {string|null} runId  run to follow; "mock" replays data/sample-events.jsonl
 * @returns {{ run: object|null, connected: boolean, error: string|null }}
 */
export function useRunEvents(runId) {
  const [run, setRun] = useState(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  const buffer = useRef([]);
  const frame = useRef(0);

  useEffect(() => {
    if (!runId) { setRun(null); return undefined; }
    let cancelled = false;
    setRun(emptyRun(runId));
    setError(null);

    const flush = () => {
      frame.current = 0;
      const events = buffer.current;
      buffer.current = [];
      if (events.length && !cancelled) setRun((r) => applyEvents(r ?? emptyRun(runId), events));
    };
    const push = (ev) => {
      buffer.current.push(ev);
      if (!frame.current) frame.current = requestAnimationFrame(flush);
    };

    if (runId === "mock") return replayMock(push, () => cancelled, setConnected, () => { cancelled = true; });

    // Snapshot first for things events don't carry (learner names, rubric).
    fetch(`/api/runs/${runId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status === 404 ? "Run not found" : `HTTP ${r.status}`))))
      .then((snap) => !cancelled && setRun((r) => ({ ...(r ?? emptyRun(runId)), learners: snap.learners ?? {}, goal: snap.goal })))
      .catch((err) => !cancelled && setError(err.message));

    const source = new EventSource(`/api/runs/${runId}/events`);
    source.onopen = () => setConnected(true);
    source.onmessage = (msg) => { try { push(JSON.parse(msg.data)); } catch { /* ignore malformed */ } };
    source.onerror = () => setConnected(false); // EventSource reconnects by itself and resumes via Last-Event-ID

    return () => {
      cancelled = true;
      source.close();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      buffer.current = [];
    };
  }, [runId]);

  return { run, connected, error };
}

// ?mock=1: replays the recorded fake run so UI work never waits for the back end.
function replayMock(push, isCancelled, setConnected, cancel) {
  let timer;
  import("../../../data/sample-events.jsonl?raw").then(({ default: text }) => {
    const events = text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
    setConnected(true);
    let i = 0;
    const tick = () => {
      if (isCancelled() || i >= events.length) return;
      push(events[i++]);
      timer = setTimeout(tick, 120);
    };
    tick();
  });
  return () => { cancel(); clearTimeout(timer); };
}
