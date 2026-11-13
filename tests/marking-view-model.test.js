import assert from "node:assert/strict";
import test from "node:test";
import { findQuoteRanges, quoteExists } from "../shared/evidence.js";
import {
  correctionRows,
  groupTraceEvents,
  TRACE_STAGES,
  visibleTraceEvents
} from "../web/src/components/markingViewModel.js";

test("trace view keeps the latest 300 events and groups all six stages in order", () => {
  const events = Array.from({ length: 305 }, (_, index) => ({
    stage: index === 304 ? "deliver" : "act",
    message: `Event ${index}`
  }));
  const visible = visibleTraceEvents(events);
  assert.equal(visible.length, 300);
  assert.equal(visible[0].message, "Event 5");
  assert.deepEqual(groupTraceEvents(visible).map(({ id }) => id), TRACE_STAGES.map(({ id }) => id));
  assert.equal(groupTraceEvents(visible)[2].events.length, 299);
});

test("correction rows expose score changes, reasons, attempts, and unresolved status", () => {
  const rows = correctionRows([
    {
      t: "2026-01-01T10:00:00Z",
      stage: "correct",
      agent: "marker",
      kind: "correction",
      ref: "script_14",
      message: "Corrected script",
      data: {
        before: { total_pct: 70 },
        after: { total_pct: 55 },
        reasons: ["No evidence quoted"],
        attempt: 2
      }
    },
    {
      t: "2026-01-01T10:01:00Z",
      agent: "marker",
      kind: "status",
      message: "Needs teacher review",
      ref: "script_15",
      data: { status: "needs_teacher" }
    }
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].before, "70.0%");
  assert.equal(rows[0].after, "55.0%");
  assert.deepEqual(rows[0].reasons, ["No evidence quoted"]);
  assert.equal(rows[0].attempt, 2);
  assert.equal(rows[1].needsTeacher, true);
});

test("correction rows have unique keys for different correction agents on the same attempt", () => {
  const rows = correctionRows([
    { t: "2026-01-01T10:00:00Z", stage: "correct", agent: "marker", kind: "correction", ref: "L08", data: { attempt: 2 } },
    { t: "2026-01-01T10:01:00Z", stage: "correct", agent: "checker", kind: "correction", ref: "L08", data: { attempt: 2 } }
  ]);
  assert.equal(new Set(rows.map(({ key }) => key)).size, rows.length);
});

test("evidence highlighting uses the same normalized matching as the code check", () => {
  const script = "The teacher-approved\n dictionary app can help.";
  const quote = "“THE TEACHER-APPROVED dictionary app”";
  assert.equal(quoteExists(quote, script), true);
  const [range] = findQuoteRanges(script, [quote]);
  assert.equal(script.slice(range.start, range.end), "The teacher-approved\n dictionary app");
  assert.deepEqual(findQuoteRanges(script, ["not in the script"]), []);
});
