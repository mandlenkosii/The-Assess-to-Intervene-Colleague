export const TRACE_STAGES = Object.freeze([
  { id: "goal", label: "Goal" },
  { id: "plan", label: "Plan" },
  { id: "act", label: "Act" },
  { id: "check", label: "Check" },
  { id: "correct", label: "Correct" },
  { id: "deliver", label: "Deliver" }
]);

export function visibleTraceEvents(events, limit = 300) {
  return events.slice(-limit);
}

export function groupTraceEvents(events) {
  const groups = new Map(TRACE_STAGES.map((stage) => [stage.id, []]));
  for (const event of events) {
    groups.get(event.stage)?.push(event);
  }
  return TRACE_STAGES.map((stage) => ({
    ...stage,
    events: groups.get(stage.id)
  }));
}

function isNeedsTeacher(event) {
  return event.data?.status === "needs_teacher" ||
    event.data?.after?.status === "needs_teacher" ||
    event.data?.needs_teacher === true;
}

function displayTotal(mark) {
  const total = typeof mark === "number" ? mark : mark?.total_pct;
  return typeof total === "number" ? `${total.toFixed(1)}%` : "—";
}

export function correctionRows(events) {
  return events
    .filter((event) => event.kind === "correction" || isNeedsTeacher(event))
    .map((event) => {
      const data = event.data || {};
      const before = data.before;
      const after = data.after;
      const reasons = data.reasons || (data.reason ? [data.reason] : []);
      return {
        key: `${event.ref || event.t}-${data.attempt || ""}-${event.kind}`,
        scriptId: event.ref || data.script_id || "Script",
        agent: event.agent || "agent",
        before: displayTotal(before),
        after: displayTotal(after),
        reasons: Array.isArray(reasons) ? reasons : [String(reasons)],
        attempt: data.attempt,
        needsTeacher: isNeedsTeacher(event),
        message: event.message || ""
      };
    });
}
