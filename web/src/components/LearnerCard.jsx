export default function LearnerCard({ learner, mark, diagnosis, task }) {
  if (learner?.loading) {
    return (
      <article className="card learner-card learner-skeleton" aria-label="Loading learner">
        <span className="skeleton skeleton-title" />
        <span className="skeleton skeleton-score" />
        <span className="skeleton skeleton-line" />
        <span className="skeleton skeleton-line short" />
      </article>
    );
  }
  const severity = diagnosis?.severity ?? "on_track";
  const name = learner?.name ?? learner?.learner_id ?? "Learner";
  return (
    <article className="card learner-card">
      <div className="learner-card-heading">
        <div>
          <p className="eyebrow">{learner?.learner_id ?? mark?.script_id}</p>
          <h3>{name}</h3>
        </div>
        <div className="learner-score">
          <strong>{Number.isFinite(mark?.total_pct) ? `${Math.round(mark.total_pct)}%` : "—"}</strong>
          <span className={`badge badge-${severity.replace("_", "-")}`}>{severity.replace("_", " ")}</span>
        </div>
      </div>
      {diagnosis && <p className="learner-gap"><strong>Focus:</strong> {diagnosis.root_gap}</p>}
      {mark?.feedback && <p className="learner-feedback">{mark.feedback}</p>}
      {task && (
        <section className="practice-task">
          <div className="practice-title">
            <h4>Catch-up practice</h4>
            {(task.attempt ?? 1) > 1 && <span className="badge badge-correct">Rebuilt after review</span>}
          </div>
          {task.reviewReason && <p className="muted">Checker feedback: {task.reviewReason}</p>}
          <p>{task.instructions}</p>
          <ol>{task.questions.map((question, index) => <li key={`${index}-${question}`}>{question}</li>)}</ol>
          <details>
            <summary>Show answer key</summary>
            <ol>{task.answer_key.map((answer, index) => <li key={`${index}-${answer}`}>{answer}</li>)}</ol>
          </details>
        </section>
      )}
      {mark?.status === "needs_teacher" && <span className="badge badge-needs-teacher">Needs teacher review</span>}
    </article>
  );
}
