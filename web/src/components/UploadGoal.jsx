// The only input screen: one goal + files (or the demo class). No chat, no step-by-step instructions.
import { useEffect, useState } from "react";

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

  useEffect(() => {
    let cancelled = false;
    fetch("/api/runs/latest")
      .then((r) => (r.ok ? r.json() : null))
      .then((run) => { if (!cancelled && run?.id && run.status !== "error") setLatest(run); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const ready = files.rubric?.length && files.scripts?.length && files.learners?.length;

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
    setBusy("upload"); setError(null);
    const form = new FormData();
    form.append("goal", goal);
    for (const [name, list] of Object.entries(files)) for (const f of list) form.append(name, f);
    try {
      const { runId } = await postJson("/api/runs", { method: "POST", body: form });
      onStarted(runId);
    } catch (err) { setError(err.message); setBusy(null); }
  }

  return (
    <main className="app-shell upload-shell">
      <header className="topbar">
        <a className="brand" href="/">Assess-to-Intervene <span>Colleague</span></a>
        <div className="status-pill"><span className="status-dot" /> Ready for a class</div>
      </header>

      <section className="card upload-card">
        <p className="eyebrow">Give your colleague one goal</p>
        <h1 className="upload-title">What should get done?</h1>
        <textarea className="goal-input" value={goal} onChange={(e) => setGoal(e.target.value)} rows={3} aria-label="Goal" />

        <div className="upload-actions">
          <button className="btn-primary btn-large" type="button" onClick={startDemo} disabled={Boolean(busy) || !goal.trim()}>
            {busy === "demo" ? "Starting…" : <>Load demo class <span aria-hidden="true">→</span></>}
          </button>
          <span className="muted">30 synthetic Grade 10 essays, rubric and 3 teacher-marked anchors</span>
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
            </div>
            <button className="btn-secondary" type="submit" disabled={!ready || Boolean(busy) || !goal.trim()}>
              {busy === "upload" ? "Uploading…" : "Start with my files"}
            </button>
          </form>
        </details>
      </section>
      <footer>Human review stays in control. Nothing is sent before approval.</footer>
    </main>
  );
}
