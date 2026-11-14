import { useEffect, useRef, useState } from "react";
import AgentScene from "./components/AgentScene.jsx";
import ApprovePanel from "./components/ApprovePanel.jsx";
import LearnerCard from "./components/LearnerCard.jsx";
import Outbox from "./components/Outbox.jsx";
import { CorrectionLog } from "./components/index.js";

const stages = ["Goal", "Plan", "Act", "Check", "Correct", "Deliver"];
const severityOrder = { needs_help: 0, watch: 1, on_track: 2 };
const runningStatuses = new Set(["planning", "marking", "reviewing", "intervening", "delivering"]);
const asArray = (value) => Array.isArray(value) ? value : Object.values(value ?? {});
const agentLabels = {
  planner: "Planner",
  marker: "Marker",
  calibrator: "Reviewer",
  reviewer: "Reviewer",
  diagnostician: "Diagnostician",
  builder: "Builder",
  checker: "Checker",
  delivery: "Delivery"
};

export default function App({ run, loading = false, onApprove, busy = false }) {
  const [activeTab, setActiveTab] = useState("Learners");
  const sceneRef = useRef(null);
  const previousEventCount = useRef(0);
  const events = asArray(run?.log);
  const hasBrief = events.some((event) => event.data?.artifact === "brief.md");
  const hasWorkbook = events.some((event) => event.data?.artifact === "marks.xlsx");
  const diagnoses = asArray(run?.diagnoses);
  const marks = asArray(run?.marks);
  const tasks = asArray(run?.tasks);
  const learners = asArray(run?.learners);
  const scripts = run?.scripts ?? {};
  const learnerRecords = learners.length
    ? learners
    : diagnoses.map((diagnosis) => ({ learner_id: diagnosis.learner_id }));

  useEffect(() => {
    const newEvents = events.slice(previousEventCount.current);
    for (const event of newEvents) {
      if (event.stage !== "correct") continue;
      if (event.kind === "replan" || event.data?.route === "planner") {
        sceneRef.current?.pulseLoop("Reviewer", "Planner");
      } else if (event.agent === "checker") {
        sceneRef.current?.pulseLoop("Checker", "Builder");
      } else {
        sceneRef.current?.pulseLoop("Reviewer", "Marker");
      }
    }
    previousEventCount.current = events.length;
  }, [run?.log]);

  const sortedLearners = [...learnerRecords].sort((a, b) => {
    const aSeverity = diagnoses.find((item) => item.learner_id === a.learner_id)?.severity ?? "on_track";
    const bSeverity = diagnoses.find((item) => item.learner_id === b.learner_id)?.severity ?? "on_track";
    return severityOrder[aSeverity] - severityOrder[bSeverity];
  });
  const lastAgent = events.at(-1)?.agent;
  const activeAgent = agentLabels[String(lastAgent ?? "").toLowerCase()] ?? lastAgent;
  const isRunning = runningStatuses.has(run?.status);
  // Stage bar: where the colleague is now, and how far it has got (corrections loop back, so "reached" is the furthest seen).
  const currentStage = run?.status === "done" ? -1 : stages.findIndex((stage) => stage.toLowerCase() === events.at(-1)?.stage);
  const reachedStage = run?.status === "done"
    ? stages.length
    // Transcription events (handwriting feature) happen before marking, so they don't move the rail.
    : events.filter((event) => event.agent !== "transcriber")
      .reduce((furthest, event) => Math.max(furthest, stages.findIndex((stage) => stage.toLowerCase() === event.stage)), -1);

  return (
    <main className="app-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">A second pair of eyes, and a next step</p>
          <h1>Better feedback.<br /><span className="hero-highlight">Less marking alone.</span></h1>
          <p>Review marks, see the evidence, and turn learning gaps into practice.</p>
        </div>
        <AgentScene ref={sceneRef} activeAgent={activeAgent} approved={run?.approved} isRunning={isRunning} />
      </section>

      <nav className="stage-nav" aria-label="Assessment stages">
        {stages.map((stage, index) => (
          <div
            className={`stage-item${index === currentStage ? " is-current" : index <= reachedStage ? " is-reached" : ""}`}
            aria-current={index === currentStage ? "step" : undefined}
            key={stage}
          >
            <span className="stage-number">{String(index + 1).padStart(2, "0")}</span>
            <span>{stage}</span>
          </div>
        ))}
      </nav>

      <section className="workspace-grid">
        <section className="card main-panel">
          <div className="panel-heading"><div><p className="eyebrow">Workspace</p><h2>Your class</h2></div><div className="panel-heading-actions"><span className="count-label">{run ? `${learnerRecords.length} learners` : "No run loaded"}</span><a className="btn-secondary new-run-link" href="/">New run</a></div></div>
          <div className="tabs" role="tablist" aria-label="Class workspace">
            {["Learners", "Approval", "Outbox"].map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                className={activeTab === tab ? "tab-button active" : "tab-button"}
                onClick={() => setActiveTab(tab)}
              >{tab}</button>
            ))}
          </div>
          {activeTab === "Learners" && (
            loading
              ? <div className="learner-list">{[1, 2, 3].map((item) => <LearnerCard key={item} learner={{ loading: true }} />)}</div>
              : run
                ? <div className="learner-list">{sortedLearners.map((learner) => {
                  const learnerId = learner.learner_id;
                  const diagnosis = diagnoses.find((item) => item.learner_id === learnerId);
                  const mark = marks.find((item) => (item.learner_id ?? item.script_id) === learnerId);
                  const task = tasks.find((item) => item.learner_id === learnerId);
                  const scriptText = typeof scripts[learnerId] === "string" ? scripts[learnerId] : undefined;
                  return <LearnerCard
                    key={learnerId}
                    learner={learner}
                    mark={mark}
                    diagnosis={diagnosis}
                    task={task}
                    scriptText={scriptText}
                  />;
                })}</div>
                : <div className="empty-state">
                  <div className="empty-icon" aria-hidden="true">✦</div>
                  <h3>Start with a class set</h3>
                  <p>Load a class to review each learner’s marks, diagnosed gap, and checked catch-up task.</p>
                  <button className="btn-primary" type="button" disabled>Load class set <span aria-hidden="true">→</span></button>
                  <small>The run service is not connected yet.</small>
                </div>
          )}
          {activeTab === "Approval" && <ApprovePanel run={run?.status === "awaiting_approval" ? run : null} onApprove={onApprove} busy={busy} />}
          {activeTab === "Outbox" && (
            <Outbox
              messages={run?.outbox ?? []}
              runId={run?.id}
              hasBrief={hasBrief}
              hasWorkbook={hasWorkbook}
            />
          )}
        </section>

        <CorrectionLog events={events} />
      </section>
      <footer>Human review stays in control. Nothing is sent before approval.</footer>
    </main>
  );
}
