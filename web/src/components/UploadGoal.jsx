// The only input screen: one goal + files (or the built-in class set). No chat, no step-by-step instructions.
import { useEffect, useState } from "react";
import AgentScene from "./AgentScene.jsx";
import HandwritingReview from "./HandwritingReview.jsx";
import { fetchFeatures, shrinkPhoto } from "../lib/handwriting.js";

// Shown only when the server has FEATURE_HANDWRITING on.
const PHOTO_FIELD = { name: "photos", label: "Handwritten scripts", hint: "photos or scans, one per learner (name = learner id)", accept: ".jpg,.jpeg,.png,.pdf" };

export const DEFAULT_GOAL =
  "Mark this class set against the rubric, check the marks, and prepare catch-up plans for anyone who is struggling.";

const FIELDS = [
  { name: "rubric", label: "Rubric / memo", hint: ".json or .txt", accept: ".json,.txt,.md,.pdf,.docx" },
  { name: "anchors", label: "Anchor scripts (teacher-marked)", hint: "2–3 files", accept: ".txt,.pdf,.docx", multiple: true },
  { name: "anchorMarks", label: "Anchor marks", hint: "anchors.json", accept: ".json" },
  { name: "scripts", label: "Class scripts", hint: "one file per learner", accept: ".txt,.pdf,.docx", multiple: true },
  { name: "learners", label: "Learners", hint: "learners.csv", accept: ".csv" },
];

async function postJson(url, init) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
}

export default function UploadGoal({ onStarted }) {
  const [goal, setGoal] = useState(DEFAULT_GOAL);
  const [files, setFiles] = useState({});
  const [busy, setBusy] = useState(null); // "demo" | "upload" | null
  const [error, setError] = useState(null);
  const [latest, setLatest] = useState(null); // most recent run (e.g. the warmed demo run), to reopen instantly
  const [handwriting, setHandwriting] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [review, setReview] = useState(null); // { jobId, photos } while the teacher checks transcriptions

  useEffect(() => {
    let cancelled = false;
    fetchFeatures().then((f) => { if (!cancelled) setHandwriting(f.handwriting); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/runs/latest")
      .then((r) => (r.ok ? r.json() : null))
      .then((run) => { if (!cancelled && run?.id && run.status !== "error") setLatest(run); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const ready = files.rubric?.length && (files.scripts?.length || photos.length) && files.learners?.length;

  async function startDemo() {
    setBusy("demo"); setError(null);
    try {
      const { runId } = await postJson("/api/runs/demo", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal }),
      });
      onStarted(runId);
    } catch (err) { setError(err.message); setBusy(null); }
  }

  async function startUpload(e) {
    e.preventDefault();
    if (handwriting && photos.length) return startTranscription();
    setBusy("upload"); setError(null);
    const form = new FormData();
    form.append("goal", goal);
    for (const [name, list] of Object.entries(files)) for (const f of list) form.append(name, f);
    try {
      const { runId } = await postJson("/api/runs", { method: "POST", body: form });
      onStarted(runId);
    } catch (err) { setError(err.message); setBusy(null); }
  }

  // Handwritten scripts: transcribe first; the teacher checks the text, then marking starts as a normal upload.
  async function startTranscription() {
    setBusy("upload"); setError(null);
    try {
      const shrunk = await Promise.all(photos.map(shrinkPhoto));
      const form = new FormData();
      for (const f of shrunk) form.append("photos", f);
      const { id } = await postJson("/api/transcriptions", { method: "POST", body: form });
      setReview({ jobId: id, photos });
      setBusy(null);
    } catch (err) { setError(err.message); setBusy(null); }
  }

  async function startFromReview(transcribed) {
    setBusy("upload"); setError(null);
    const form = new FormData();
    form.append("goal", goal);
    for (const [name, list] of Object.entries(files)) for (const f of list) form.append(name, f);
    for (const { id, text } of transcribed) form.append("scripts", new File([text], `${id}.txt`, { type: "text/plain" }));
    form.append("transcriptionId", review.jobId);
    try {
      const { runId } = await postJson("/api/runs", { method: "POST", body: form });
      onStarted(runId);
    } catch (err) { setError(err.message); setBusy(null); }
  }

  return (
    <main className="app-shell upload-shell">
      <section className="upload-hero">
        <p className="eyebrow">Assess · Diagnose · Intervene</p>
        <h1>One goal. <span className="hero-highlight">Seven agents.</span></h1>
        <p>Your colleague plans the work, marks every script, checks itself, corrects its mistakes and builds catch-up plans, then waits for your approval.</p>
      </section>
      <div className="upload-scene">
        <AgentScene ambient label="Seven agents orbiting the goal and passing work between them" />
      </div>

      {review ? (
        <HandwritingReview
          jobId={review.jobId} photos={review.photos} busy={busy === "upload"} error={error}
          onStart={startFromReview} onCancel={() => { setReview(null); setError(null); }}
        />
      ) : (
      <section className="card upload-card">
        <p className="eyebrow">Give your colleague one goal</p>
        <h2 className="upload-title">What should get done?</h2>
        <textarea className="goal-input" value={goal} onChange={(e) => setGoal(e.target.value)} rows={3} aria-label="Goal" />

        <div className="upload-actions">
          <button className="btn-primary btn-large" type="button" onClick={startDemo} disabled={Boolean(busy) || !goal.trim()}>
            {busy === "demo" ? "Starting…" : <>Load class set <span aria-hidden="true">→</span></>}
          </button>
          <span className="muted">Grade 10 English · 30 essays, rubric and 3 teacher-marked anchors</span>
          {latest && (
            <button className="btn-secondary" type="button" onClick={() => onStarted(latest.id)} disabled={Boolean(busy)}>
              Open last run <span className="muted">({latest.status === "awaiting_approval" ? "waiting for approval" : latest.status})</span>
            </button>
          )}
        </div>

        {error && <p className="upload-error" role="alert">{error}</p>}

        <details className="upload-files">
          <summary>Or use your own class files</summary>
          <form onSubmit={startUpload}>
            <div className="file-grid">
              {FIELDS.map((f) => (
                <label key={f.name} className="file-field">
                  <span className="file-label">{f.label}</span>
                  <small className="muted">{files[f.name]?.length ? `${files[f.name].length} selected` : f.hint}</small>
                  <input
                    type="file" name={f.name} accept={f.accept} multiple={f.multiple}
                    onChange={(e) => setFiles((prev) => ({ ...prev, [f.name]: [...e.target.files] }))}
                  />
                </label>
              ))}
              {handwriting && (
                <label className="file-field">
                  <span className="file-label">{PHOTO_FIELD.label}</span>
                  <small className="muted">{photos.length ? `${photos.length} selected` : PHOTO_FIELD.hint}</small>
                  <input type="file" name={PHOTO_FIELD.name} accept={PHOTO_FIELD.accept} multiple onChange={(e) => setPhotos([...e.target.files])} />
                </label>
              )}
            </div>
            <button className="btn-secondary" type="submit" disabled={!ready || Boolean(busy) || !goal.trim()}>
              {busy === "upload" ? "Uploading…" : handwriting && photos.length ? "Read handwriting" : "Start with my files"}
            </button>
          </form>
        </details>
      </section>
      )}
      <footer>Human review stays in control. Nothing is sent before approval.</footer>
    </main>
  );
}
