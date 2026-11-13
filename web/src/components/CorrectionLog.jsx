import { useEffect, useRef } from "react";
import { correctionRows } from "./markingViewModel.js";
import "./marking.css";

export function CorrectionLog({ events = [] }) {
  const rows = correctionRows(events);
  const listRef = useRef(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    if (!pausedRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [rows]);

  function handleScroll() {
    const element = listRef.current;
    if (element) {
      pausedRef.current = element.scrollHeight - element.scrollTop - element.clientHeight > 40;
    }
  }

  return (
    <section className="marking-panel marking-correction-panel" aria-labelledby="correction-title">
      <header className="marking-panel__header">
        <div>
          <h2 id="correction-title">Correction log</h2>
          <p>Every return includes its reason</p>
        </div>
        <span className="correction-count" aria-label={`${rows.length} corrections`}>{rows.length}</span>
      </header>
      {rows.length === 0 ? (
        <p className="marking-empty">No corrections yet.</p>
      ) : (
        <ol className="marking-correction-list" ref={listRef} onScroll={handleScroll}>
          {rows.map((row) => (
            <li className="correction-row" key={row.key}>
              <div className="correction-row__top">
                <strong>{row.scriptId}</strong>
                <span className="trace-agent">{row.agent}</span>
                {row.needsTeacher && <span className="badge-needs-teacher">Needs teacher</span>}
              </div>
              {row.before !== "—" || row.after !== "—" ? (
                <p className="correction-scores">
                  <span>{row.before}</span>
                  <span className="correction-arrow" aria-label="corrected to">→</span>
                  <strong>{row.after}</strong>
                </p>
              ) : (
                <p className="correction-message">{row.message}</p>
              )}
              {row.reasons.length > 0 && (
                <ul className="correction-reasons">
                  {row.reasons.map((reason, index) => <li key={`${reason}-${index}`}>{reason}</li>)}
                </ul>
              )}
              {row.attempt && <p className="correction-attempt">Attempt {row.attempt}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
