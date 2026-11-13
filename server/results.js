// Measured demo results from a finished run, mapped to the five judging criteria.
// Pure: (run, expected) → results. The CLI (scripts/results.js) loads the run and writes the file.
import { quoteExists } from "../shared/evidence.js";

const ms = (a, b) => (a && b ? Date.parse(b) - Date.parse(a) : null);

export function computeResults(run, expected) {
  const log = run.log ?? [];
  const tolerance = expected.accuracy_tolerance_percentage_points ?? 10;
  const expectedById = new Map((expected.scripts ?? []).map((s) => [s.script_id, s]));
  const marks = Object.values(run.marks ?? {});
  const tasks = Object.values(run.tasks ?? {});
  const diagnoses = Object.values(run.diagnoses ?? {});
  const struggling = diagnoses.filter((d) => d.severity !== "on_track");
  const corrections = log.filter((e) => e.kind === "correction");
  const markFixes = corrections.filter((e) => e.ref && typeof e.data?.after === "number" && e.data.after !== e.data.before);
  const rejectedRefs = new Set(log.filter((e) => e.kind === "review" && e.data?.review?.verdict === "reject").map((e) => e.ref));
  const borderline = run.plan?.borderline ?? [40, 55];

  // Accuracy: final totals vs the team's own expected marks.
  const compared = marks.filter((m) => expectedById.has(m.script_id));
  const within = compared.filter((m) => Math.abs(m.total_pct - expectedById.get(m.script_id).expected_total_pct) <= tolerance);

  // Evidence: every criterion score backed by a quote that is really in the script.
  const scores = marks.flatMap((m) => m.scores.map((s) => ({ ok: quoteExists(s.evidence, run.scripts?.[m.script_id] ?? "") })));

  // Traps: did the colleague handle each planted trap the way the team expected?
  const traps = (expected.scripts ?? []).filter((s) => s.trap).map((s) => {
    const mark = run.marks?.[s.script_id];
    const final = mark?.total_pct ?? null;
    const close = final !== null && Math.abs(final - s.expected_total_pct) <= tolerance;
    const firstMark = log.find((e) => e.kind === "mark" && e.ref === s.script_id)?.data?.mark?.total_pct ?? final;
    let handled;
    if (s.expected_review === "rejected") handled = rejectedRefs.has(s.script_id) && close;
    else if (s.expected_review === "blind_remark") handled = close && (rejectedRefs.has(s.script_id) || (final >= borderline[0] && final <= borderline[1]) || (firstMark >= borderline[0] && firstMark <= borderline[1]));
    else handled = close;
    if (s.trap === "weak_structure_only") {
      const d = run.diagnoses?.[s.script_id];
      handled = handled && /structure/i.test(d?.root_gap ?? "") && (!run.tasks?.[s.script_id] || /structure/i.test(run.tasks[s.script_id].gap));
    }
    return {
      script_id: s.script_id, trap: s.trap, expected_review: s.expected_review,
      expected_pct: s.expected_total_pct, first_pct: round(firstMark), final_pct: round(final),
      rejected_by_reviewer: rejectedRefs.has(s.script_id), handled: Boolean(handled),
    };
  });

  const t = (pred) => log.find(pred)?.t;
  const started = log[0]?.t;
  const gate = t((e) => e.kind === "status" && e.data?.status === "awaiting_approval");
  const done = t((e) => e.kind === "status" && e.data?.status === "done");
  const llmStats = log.find((e) => e.data?.llm_stats)?.data.llm_stats ?? null;
  const agents = new Set(log.map((e) => e.agent).filter((a) => a && a !== "teacher"));
  const handoffs = log.reduce((n, e, i) => n + (i > 0 && e.agent !== log[i - 1].agent ? 1 : 0), 0);
  const outbox = run.outbox ?? [];

  const r = {
    run_id: run.id,
    model: log.find((e) => e.data?.model)?.data.model ?? "unknown",
    measured_at: new Date().toISOString(),
    scripts: { total: Object.keys(run.scripts ?? {}).length, marked: marks.length, needs_teacher: marks.filter((m) => m.status === "needs_teacher").length },
    accuracy: { tolerance_points: tolerance, within: within.length, compared: compared.length, target: expected.minimum_scripts_within_tolerance ?? null },
    evidence: { scores: scores.length, verbatim: scores.filter((s) => s.ok).length },
    corrections: {
      marks_changed: new Set(markFixes.map((e) => e.ref)).size,
      reviewer_rejections: rejectedRefs.size,
      replans: run.plan?.replans ?? 0,
      tasks_rebuilt: tasks.filter((x) => x.attempt > 1).length,
      total_events: corrections.length,
    },
    traps: { handled: traps.filter((x) => x.handled).length, total: traps.length, detail: traps },
    intervention: { struggling: struggling.length, tasks: tasks.length, tasks_checked_ok: tasks.filter((x) => x.status !== "needs_teacher").length, class_gaps: (run.classGaps ?? []).map((g) => g.criterion) },
    delivery: { approved: Boolean(run.approved), sent: outbox.filter((m) => m.status === "sent").length, failed: outbox.filter((m) => m.status === "failed").length, skipped: outbox.filter((m) => m.status === "skipped").length },
    timing_seconds: { to_approval: secs(ms(started, gate)), total: secs(ms(started, done ?? gate)) },
    model_calls: llmStats ? { live: llmStats.calls ?? null, from_cache: llmStats.cacheHits ?? null, fallbacks: llmStats.fallbacks ?? 0 } : null,
    collaboration: { agents: agents.size, handoffs },
  };

  r.criteria = {
    reasons: `Planner split ${r.scripts.total} scripts into ${run.plan?.batches?.length ?? "?"} batches${r.corrections.replans ? ` and re-planned ${r.corrections.replans}× when marks drifted from the teacher's anchors` : ""}.`,
    self_corrects: `${n(r.corrections.reviewer_rejections, "mark")} rejected by the reviewer, ${r.corrections.marks_changed} changed, ${r.corrections.tasks_rebuilt} catch-up tasks rebuilt; ${r.traps.handled}/${r.traps.total} planted traps handled.`,
    executes: `${r.scripts.marked}/${r.scripts.total} scripts marked, ${r.intervention.tasks} tasks, a teacher brief and marks.xlsx${r.delivery.approved ? `; ${r.delivery.sent} emails sent after approval` : ""}.`,
    collaborates: `${r.collaboration.agents} agents, ${r.collaboration.handoffs} handoffs, every one in the live trace.`,
    serves_education: `${r.intervention.tasks_checked_ok}/${r.intervention.struggling} struggling learners got a checked catch-up task aimed at their gap; accuracy ${r.accuracy.within}/${r.accuracy.compared} within ${tolerance} points of the team's marks.`,
  };
  r.closing_line = `${n(r.scripts.marked, "script")}, ${n(r.corrections.marks_changed, "mark")} corrected, ${r.traps.handled} of ${n(r.traps.total, "trap")} caught, ${n(r.intervention.tasks, "catch-up plan")}, ${r.accuracy.within} of ${r.accuracy.compared} within ${tolerance} points of a teacher${r.timing_seconds.to_approval >= 1 ? `, in ${fmt(r.timing_seconds.to_approval)}` : ""}.`;
  return r;
}

const n = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
const round = (n) => (typeof n === "number" ? Math.round(n * 10) / 10 : null);
const secs = (n) => (typeof n === "number" ? Math.round(n / 100) / 10 : null);
const fmt = (s) => (s >= 90 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${Math.round(s)} seconds`);
