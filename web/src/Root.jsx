// Chooses between the goal screen and the run workspace. The run id lives in the URL (?run=…),
// so a refresh reconnects and the SSE stream replays the run. ?mock=1 replays data/sample-events.jsonl.
import { useCallback, useState } from "react";
import App from "./App.jsx";
import UploadGoal from "./components/UploadGoal.jsx";
import { useRunEvents } from "./lib/useRunEvents.js";

function initialRunId() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mock") === "1") return "mock";
  return params.get("run");
}

export default function Root() {
  const [runId, setRunId] = useState(initialRunId);
  const [busy, setBusy] = useState(false);
  const { run, error } = useRunEvents(runId);

  const onStarted = useCallback((id) => {
    const url = new URL(window.location.href);
    url.searchParams.set("run", id);
    url.searchParams.delete("mock");
    window.history.pushState({}, "", url);
    setRunId(id);
  }, []);

  // The human gate. ApprovePanel calls this with the learners the teacher chose to exclude.
  const onApprove = useCallback(async ({ excluded = [] } = {}) => {
    if (!runId || runId === "mock") return;
    setBusy(true);
    try {
      const res = await fetch(`/api/runs/${runId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved: true, excluded }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Approval failed (${res.status})`);
    } finally {
      setBusy(false);
    }
  }, [runId]);

  if (!runId) return <UploadGoal onStarted={onStarted} />;
  if (error === "Run not found") {
    // Server restarted (runs live in memory); go back to the goal screen.
    window.history.replaceState({}, "", window.location.pathname);
    return <UploadGoal onStarted={onStarted} />;
  }
  return <App run={run} loading={!run || run.log.length === 0} onApprove={onApprove} busy={busy} />;
}
