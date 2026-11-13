import { useMemo, useState } from "react";
import { findQuoteRanges } from "../../../shared/evidence.js";
import "./marking.css";

function EvidenceText({ text, ranges, corrected }) {
  if (!text || ranges.length === 0) {
    return <p>{text || "No script text is available."}</p>;
  }
  const parts = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      parts.push(text.slice(cursor, range.start));
    }
    parts.push(
      <mark className={corrected ? "script-evidence script-evidence--corrected" : "script-evidence"} key={`${range.start}-${range.end}`}>
        {text.slice(range.start, range.end)}
      </mark>
    );
    cursor = range.end;
  }
  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }
  return <p>{parts}</p>;
}

export function ScriptCard({ mark, scriptText, learnerName, corrected = false, showFeedback = true }) {
  const [showScript, setShowScript] = useState(false);
  const scores = mark?.scores || [];
  const evidenceQuotes = useMemo(() => scores.map(({ evidence }) => evidence), [scores]);
  const evidenceRanges = useMemo(
    () => findQuoteRanges(scriptText || "", evidenceQuotes),
    [scriptText, evidenceQuotes]
  );

  if (!mark) {
    return null;
  }

  return (
    <section className="marking-panel script-card" aria-label={`Mark for ${learnerName || mark.script_id}`}>
      <header className="script-card__header">
        <div>
          <h2>{learnerName || mark.script_id}</h2>
          <p>{mark.script_id} · Attempt {mark.attempt || 1}</p>
        </div>
        <strong className="script-total">{Number(mark.total_pct).toFixed(1)}%</strong>
      </header>
      {mark.status === "needs_teacher" && <span className="badge-needs-teacher">Needs teacher</span>}
      <dl className="criterion-list">
        {scores.map((score) => (
          <div className="criterion-row" key={score.criterion}>
            <dt>{score.criterion}</dt>
            <dd>{score.score}/{score.max_score}</dd>
            <blockquote>
              <p>“{score.evidence}”</p>
              <cite>{score.reason}</cite>
            </blockquote>
          </div>
        ))}
      </dl>
      {scriptText && (
        <button
          className="marking-text-button"
          type="button"
          aria-expanded={showScript}
          onClick={() => setShowScript((visible) => !visible)}
        >
          {showScript ? "Hide evidence in script" : "Show evidence in script"}
        </button>
      )}
      {showScript && (
        <div className="script-evidence-view">
          <EvidenceText text={scriptText} ranges={evidenceRanges} corrected={corrected} />
        </div>
      )}
      {showFeedback && (
        <details className="script-feedback">
          <summary>Learner feedback</summary>
          <p>{mark.feedback}</p>
        </details>
      )}
    </section>
  );
}
