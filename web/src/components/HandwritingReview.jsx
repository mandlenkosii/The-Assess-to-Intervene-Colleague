// Handwritten scripts (FEATURE_HANDWRITING): the photo next to its transcription, editable before marking starts.
// A flagged transcription must be edited or ticked as checked before "Start marking" unlocks.
import { useEffect, useMemo, useState } from "react";
import { countIllegible, stem } from "../lib/handwriting.js";
import "./handwriting.css";

const pct = (n) => `${Math.round((n ?? 0) * 100)}%`;

export default function HandwritingReview({ jobId, photos, busy, error, onStart, onCancel }) {
  const [job, setJob] = useState(null);
  const [pollError, setPollError] = useState(null);
  const [texts, setTexts] = useState({});
  const [checked, setChecked] = useState({});

  // Local previews of the teacher's own photos; the server never sends images back.
  const previews = useMemo(() => Object.fromEntries(photos.map((f) => [stem(f.name), { url: URL.createObjectURL(f), pdf: f.type === "application/pdf" }])), [photos]);
  useEffect(() => () => Object.values(previews).forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  useEffect(() => {
    let stopped = false;
    let timer;
    async function poll() {
      try {
        const res = await fetch(`/api/transcriptions/${encodeURIComponent(jobId)}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
        if (stopped) return;
        setJob(body);
        if (body.status === "transcribing") timer = setTimeout(poll, 1000);
        else setTexts((prev) => Object.fromEntries(body.items.map((item) => [item.id, prev[item.id] ?? item.text])));
      } catch (err) {
        if (!stopped) setPollError(err.message);
      }
    }
    poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [jobId]);

  const items = job?.status === "done" ? job.items : [];
  const edited = (item) => texts[item.id] !== item.text;
  const blocked = items.filter((item) => !texts[item.id]?.trim() || (item.status === "needs_teacher" && !edited(item) && !checked[item.id]));
  const flagged = items.filter((item) => item.status === "needs_teacher").length;

  return (
    <section className="card hw-review" aria-labelledby="hw-title">
      <div className="panel-heading">
        <div><p className="eyebrow">Handwritten scripts</p><h2 id="hw-title">Check the transcriptions</h2></div>
        {job?.status === "done" && <span className={`badge ${flagged ? "badge-needs-teacher" : "badge-ok"}`}>{flagged ? `${flagged} need${flagged === 1 ? "s" : ""} you` : "all clear"}</span>}
      </div>
      <p className="muted">
        Two different models read each page, and only words they both agree on are kept. Everything else shows as
        [illegible], and the Marker treats it as missing, never as wrong. Fix anything you can read before marking starts.
      </p>

      {(pollError || error) && <p className="upload-error" role="alert">{pollError || error}</p>}
      {job?.status === "error" && <p className="upload-error" role="alert">Transcription stopped: {job.error}</p>}
      {(!job || job.status === "transcribing") && !pollError && (
        <div className="hw-progress" role="status">
          <span className="hw-spinner" aria-hidden="true" />
          Reading {job ? `${job.completed} of ${job.total}` : "the pages"}…
        </div>
      )}

      <ol className="hw-list">
        {items.map((item) => {
          const preview = previews[item.id];
          const text = texts[item.id] ?? "";
          const needsTeacher = item.status === "needs_teacher";
          return (
            <li key={item.id} className={`hw-item${needsTeacher ? " is-flagged" : ""}`}>
              <figure className="hw-image">
                {preview?.pdf
                  ? <iframe src={preview.url} title={`${item.filename} scan`} />
                  : preview ? <img src={preview.url} alt={`Handwritten script ${item.id}`} /> : <span className="muted">No preview</span>}
                <figcaption>{item.filename}</figcaption>
              </figure>
              <div className="hw-text">
                <div className="hw-meta">
                  <strong>{item.id}</strong>
                  {needsTeacher
                    ? <span className="badge badge-needs-teacher">transcription needs teacher</span>
                    : <span className="badge badge-ok">{item.method === "pdf-text" ? "typed PDF" : "readings agree"}</span>}
                  <span className="muted">{countIllegible(text)} illegible · {item.method === "pdf-text" ? "read directly" : `${pct(1 - item.disagreement)} agreement`}</span>
                </div>
                {item.reasons?.length > 0 && <ul className="hw-reasons">{item.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
                {item.notes?.filter((n) => !/failed:/.test(n)).map((n) => <p key={n} className="hw-note">{n}</p>)}
                <textarea
                  className="goal-input hw-textarea"
                  value={text}
                  rows={8}
                  aria-label={`Transcription for ${item.id}`}
                  placeholder="Type what the learner wrote. Use [illegible] for words nobody can read."
                  onChange={(e) => setTexts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                />
                {needsTeacher && !edited(item) && (
                  <label className="hw-check">
                    <input type="checkbox" checked={Boolean(checked[item.id])} onChange={(e) => setChecked((prev) => ({ ...prev, [item.id]: e.target.checked }))} />
                    I've checked this against the photo
                  </label>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="upload-actions">
        <button
          className="btn-primary btn-large" type="button"
          disabled={busy || job?.status !== "done" || !items.length || blocked.length > 0}
          onClick={() => onStart(items.map((item) => ({ id: item.id, text: texts[item.id] })))}
        >
          {busy ? "Starting…" : <>Start marking <span aria-hidden="true">→</span></>}
        </button>
        <button className="btn-secondary" type="button" onClick={onCancel} disabled={busy}>Back</button>
        {job?.status === "done" && blocked.length > 0 && (
          <span className="muted">{blocked.length} script{blocked.length === 1 ? "" : "s"} still to check: {blocked.map((b) => b.id).join(", ")}</span>
        )}
      </div>
    </section>
  );
}
