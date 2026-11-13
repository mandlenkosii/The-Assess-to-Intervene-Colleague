import { useState } from "react";

export default function ApprovePanel({ run, onApprove, busy = false }) {
  const [excluded, setExcluded] = useState([]);
  const [confirming, setConfirming] = useState(false);
  const [approvalError, setApprovalError] = useState("");
  const diagnoses = run?.diagnoses ?? [];
  const marks = Array.isArray(run?.marks) ? run.marks : Object.values(run?.marks ?? {});
  const needsTeacher = marks.filter((mark) => mark.status === "needs_teacher");
  const learners = run?.learners?.length
    ? run.learners
    : marks.map((mark) => ({ learner_id: mark.learner_id ?? mark.script_id }));

  function toggleExcluded(learnerId) {
    setExcluded((current) => current.includes(learnerId)
      ? current.filter((id) => id !== learnerId)
      : [...current, learnerId]);
  }

  async function confirmApproval() {
    setApprovalError("");
    try {
      await onApprove({ excluded });
      setConfirming(false);
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : String(error));
    }
  }

  if (!run) return <p className="muted">There is no run waiting for approval.</p>;
  return (
    <section className="card approve-panel">
      <div className="panel-heading">
        <div><p className="eyebrow">Human review</p><h2>Approve delivery</h2></div>
        <span className="badge badge-ok">{diagnoses.length} learners</span>
      </div>
      <p className="muted">Review the teacher brief and unresolved scripts. Nothing is sent until you approve.</p>
      <pre className="brief-preview">{run.brief ?? "Teacher brief is not available yet."}</pre>
      {learners.length > 0 && (
        <fieldset className="exclude-list">
          <legend>Exclude learners from delivery</legend>
          {learners.map((learner) => {
            const learnerId = learner.learner_id;
            const unresolved = needsTeacher.some((mark) => (mark.learner_id ?? mark.script_id) === learnerId);
            return (
              <label key={learnerId}>
                <input
                  type="checkbox"
                  checked={excluded.includes(learnerId)}
                  onChange={() => toggleExcluded(learnerId)}
                />
                {learner.name ?? learnerId}{unresolved ? " — needs teacher review" : ""}
              </label>
            );
          })}
        </fieldset>
      )}
      {confirming ? (
        <div className="confirm-row">
          <span>Send approved feedback to eligible learners?</span>
          <button type="button" className="btn-primary" disabled={busy || !onApprove} onClick={confirmApproval}>
            {busy ? "Sending…" : "Confirm and send"}
          </button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
        </div>
      ) : (
        <button type="button" className="btn-primary" disabled={busy} onClick={() => setConfirming(true)}>
          Approve and send
        </button>
      )}
      {approvalError && <p className="delivery-error" role="alert">{approvalError}</p>}
    </section>
  );
}
