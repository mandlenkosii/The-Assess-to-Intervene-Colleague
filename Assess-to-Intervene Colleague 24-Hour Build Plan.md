# Assess-to-Intervene Colleague: 24-Hour Build Plan

Nov 13, 2026 · @Victor

## Scope

By hour 24 the team ships one working run: 30 scripts in, marks, feedback, catch-up tasks and a teacher brief out, with every self-correction visible on screen. Everything else is a stretch goal.

**Must have (MVP)**

- Upload a rubric/memo, 2–3 teacher-marked anchor scripts and a batch of typed scripts (PDF, DOCX or TXT)
- Seven agents: Planner, Marker, Calibration Reviewer, Diagnostician, Practice Builder, Practice Checker, Delivery
- Two working review loops that send work back with a reason, with a retry limit
- A live trace UI showing the six stages (Goal, Plan, Act, Check, Correct, Deliver) and a correction log
- Teacher approval step before anything is sent
- Outputs: per-learner feedback, a catch-up task per struggling learner, a one-page teacher brief, a marks spreadsheet (.xlsx), and real email delivery

**Stretch (only after the hour-18 freeze is met)**

- Handwritten scripts via Claude vision
- Google Classroom delivery
- An LPC mode: mock CBE paper, LPC syllabus sections, 40–49% borderline flag
- Class-wide gap chart in the teacher brief

**Out of scope:** logins, multi-school accounts, issuing official results.

## Architecture

&#91;embedded content: agent architecture · 8 steps, 3 loop-backs\]

Work flows along the top row and back along the bottom. The coloured lines are the self-correction loops: rejected marks go back to the Marker, a drifting batch goes back to the Planner, and a task that misses the gap goes back to the Builder. Nothing is sent until the teacher approves.

## Stack (simplest free option at every layer)

One language (Python), one process, no paid services. Every tool below is free and open source or has a free tier with no credit card.

| Layer | Choice | Why this one | Instead of |
| --- | --- | --- | --- |
| Agent orchestration | **LangGraph** (open source, MIT) | Loops are built in: a reviewer node can route back to the marker with one conditional edge. Shared state is a plain Python dict. | CrewAI is quicker for straight-line role-play, but "send it back and redo" loops are awkward in it, and those loops are what judges score. |
| Models | **Groq free tier** (open models such as Llama, Qwen or GPT-OSS) | No card needed, very fast, OpenAI-compatible API, so switching provider is a one-line change. | Claude and GPT have no free API tier. |
| Backup model | **Gemini API free tier** (Flash) | A second free key to fall back on when Groq rate-limits. | — |
| Front end and live trace | **Streamlit** | Pure Python, no JavaScript. `st.status` and `st.expander` give a live step-by-step trace in a few lines. Free hosting on Streamlit Community Cloud. | A React app needs a separate API server and a second language. |
| Delivery | **Gmail over SMTP** with an app password (`smtplib`) | No OAuth setup, works in 10 minutes. | Gmail API and Google Classroom API need OAuth consent screens; Classroom is a stretch goal. |
| Spreadsheet export | **openpyxl** via pandas | One call writes the marks .xlsx. | — |
| File reading | **pypdf** and **python-docx** | Typed PDF, DOCX and TXT scripts. | OCR for handwriting is a stretch goal. |
| Storage | **JSON files + SQLite** | Nothing to install; the run log doubles as the correction log. | A hosted database. |
| Validation | **Pydantic** | Every agent output is checked against a schema; bad JSON is a retry, not a crash. | — |

**Rate-limit tactics:** cache every model response to disk by input hash (re-runs and the demo cost nothing), mark scripts in batches of 5, retry with backoff on HTTP 429, then fall back to the Gemini key. Free-tier limits change often, so check your own limits in the Groq console and Google AI Studio on day one.

**Privacy:** Google says free-tier Gemini requests may be used to improve its products. Use only synthetic or anonymised scripts in the demo.

**Repo layout**

```
colleague-zero/
  app.py                 # Streamlit UI: upload, live trace, approve, results
  graph.py               # LangGraph: nodes, edges, the two loops
  agents/
    planner.py  marker.py  calibrator.py
    diagnostician.py  practice_builder.py  practice_checker.py  delivery.py
  checks.py              # code-based checks (evidence quotes, score ranges, drift stats)
  llm.py                 # Groq client, Gemini fallback, disk cache, retries
  schemas.py             # Pydantic models (see Data contracts)
  prompts/               # one .md prompt per agent
  data/                  # rubric, anchors, 30 scripts, learners.csv
  runs/                  # one folder per run: state.json, log.jsonl, outputs
  requirements.txt       # langgraph, openai, google-genai, streamlit, pydantic, pandas, openpyxl, pypdf, python-docx
```

## Agents

Each agent is one LangGraph node: a Python function that reads the shared state, makes one or a few model calls, validates the result with Pydantic and writes back. Use the strongest free model for marking and reviewing, and a small fast one for formatting.

| Agent | Reads | Writes | Tools | Model |
| --- | --- | --- | --- | --- |
| Planner | Goal, rubric, script list | Plan: batches of 5, anchor set, pass mark, borderline band | None (deterministic plus one LLM call to parse the rubric) | Large |
| Marker | One script, rubric, anchor examples, any reviewer feedback | `Mark` per script: score and evidence quote per criterion, feedback text | File reader | Large |
| Calibration Reviewer | Marks, scripts, anchor marks | `Review`: accept, or reject with reason per script; batch drift flags | `checks.py` (quote match, ranges, stats) plus a blind re-mark | Large, different prompt and temperature 0 |
| Diagnostician | All final marks | `Diagnosis` per learner (root gap, severity) plus class-wide gaps | None | Large |
| Practice Builder | One diagnosis, rubric | `Task`: instructions, 3–5 questions, answer key, gap tag | None | Medium |
| Practice Checker | Task plus diagnosis | Accept or reject with reason | `checks.py` (answer key present, length) | Large |
| Delivery | Approved outputs | Emails sent, marks.xlsx, brief.md | SMTP, openpyxl | Small (brief wording only) |

**Graph edges:** Planner → Marker → Calibration Reviewer → (rejected and retries left: back to Marker; rubric drift: back to Planner to recalibrate; else) → Diagnostician → Practice Builder → Practice Checker → (rejected: back to Builder; else) → **teacher approval (human-in-the-loop interrupt)** → Delivery.

## Data contracts

Agree these in hour 1 and freeze them; everyone builds against `schemas.py`. All agents read and write one shared state object.

```python
from pydantic import BaseModel
from typing import Literal

class CriterionScore(BaseModel):
    criterion: str            # e.g. "argument"
    score: int
    max_score: int
    evidence: str             # exact quote from the script
    reason: str

class Mark(BaseModel):
    script_id: str
    scores: list[CriterionScore]
    total_pct: float
    feedback: str             # to the learner, 80-150 words
    attempt: int = 1

class Review(BaseModel):
    script_id: str
    verdict: Literal["accept", "reject"]
    reasons: list[str]        # shown in the correction log
    blind_total_pct: float | None = None

class Diagnosis(BaseModel):
    learner_id: str
    root_gap: str             # e.g. "structuring an argument"
    severity: Literal["on_track", "watch", "needs_help"]
    evidence: list[str]

class Task(BaseModel):
    learner_id: str
    gap: str
    instructions: str
    questions: list[str]
    answer_key: list[str]
    attempt: int = 1

class LogEvent(BaseModel):     # one line in runs/<id>/log.jsonl, drives the UI trace
    t: str
    stage: Literal["goal", "plan", "act", "check", "correct", "deliver"]
    agent: str
    message: str              # e.g. "Script 14: score 7 -> 5, no evidence quoted for 'argument'"

class RunState(BaseModel):
    goal: str
    rubric: dict
    anchors: dict[str, Mark]
    scripts: dict[str, str]
    marks: dict[str, Mark] = {}
    reviews: dict[str, Review] = {}
    diagnoses: dict[str, Diagnosis] = {}
    tasks: dict[str, Task] = {}
    approved: bool = False
    log: list[LogEvent] = []
```

## Self-correction rules

Run code checks first because they are free, instant and impossible to argue with. Use the model reviewer only for judgement calls. These starting thresholds are ours; tune them on the anchors in hours 6–10.

**Loop 1: marks (Calibration Reviewer)**

| Check | Type | Rule | On failure |
| --- | --- | --- | --- |
| Evidence exists | Code | Every `evidence` quote appears verbatim in the script (whitespace-normalised) | Reject: "no evidence quoted for \<criterion>" |
| Scores in range | Code | 0 ≤ score ≤ max per criterion; total matches the sum | Reject |
| Anchor agreement | Code | Marker's total on each anchor script within 10 percentage points of the teacher's mark | Back to Planner: add anchors as worked examples to the Marker prompt, re-mark the batch |
| Blind re-mark | Model | Re-mark a random 20% of scripts plus every script in the borderline band without seeing the first mark; disagreement over 10 points total or 2 marks on any criterion | Reject with both marks and reasons |
| Middle-mark drift | Code | Batch standard deviation far below the anchors', or more than 60% of totals in the middle band | Flag batch; Planner re-marks with the anchors added |

**Loop 2: practice tasks (Practice Checker)**

- The task's `gap` matches the diagnosis's `root_gap` (model check)
- An answer key exists with one answer per question (code check)
- Level fits the learner's grade; instructions under 120 words (model and code check)

**Retry limits:** a script is re-marked at most 2 times and a task rebuilt at most 2 times. After that it is marked **"needs teacher"** in the brief instead of looping forever. A human always gets the last word.

**Every rejection writes a `LogEvent` at stage `correct`.** That log is the demo's evidence.

## Dataset and planted traps

Use synthetic scripts only: one Grade 10 English argumentative essay task ("Should cellphones be allowed in South African classrooms?") with a 5-criterion rubric, 20 marks each. Generate the scripts with a model, then hand-edit them so the traps are real.

| Item | Count | Purpose |
| --- | --- | --- |
| Rubric and marking memo | 1 | Criteria: argument, evidence, structure, language, audience |
| Anchor scripts, teacher-marked | 3 | One weak, one middle, one strong; ground truth for calibration |
| Ordinary scripts | 22 | Realistic spread from about 25% to 85% |
| Trap: long but off-topic | 1 | Tempts the Marker to over-reward length |
| Trap: short but excellent | 1 | Tempts the Marker to under-reward brevity |
| Trap: fluent, no evidence | 1 | Should lose "evidence" marks; catches unevidenced scoring |
| Trap: borderline (about 45%) | 2 | Forces a blind re-mark |
| Trap: weak on structure only | 2 | Should get a structure-specific catch-up task, not a generic one |
| learners.csv | 30 rows | Learner id, name (fictional), grade, email (team inboxes) |

Keep a `expected.json` with the team's own marks for the traps, so you can show the before-and-after correction live.

**LPC mode (stretch):** swap in one mock Attorneys' Practice and Legal Ethics question, a sections-based memo and a 40–49% borderline band. The pipeline is the same; only `data/` changes.

## Team roles (four people)

With fewer people, merge roles C and D first.

| Role | Owns | Files |
| --- | --- | --- |
| A: Orchestration lead | LangGraph graph, shared state, loops, retry limits, approval interrupt, `llm.py` cache and fallback | `graph.py`, `llm.py`, `schemas.py` |
| B: Agents and prompts | All seven agent prompts, code checks, threshold tuning on anchors | `agents/`, `prompts/`, `checks.py` |
| C: UI and delivery | Streamlit app, live trace, approval screen, SMTP, .xlsx export | `app.py`, `agents/delivery.py` |
| D: Data, demo and pitch | Rubric, anchors, 30 scripts with traps, `expected.json`, demo script, slides, backup video | `data/`, pitch deck |

## 24-hour timeline

The hour-6 checkpoint matters most: one script marked end to end with evidence. If it slips, cut scope immediately (see Risks). Each person takes a 3-hour sleep slot between hours 12 and 20, staggered so two people are always awake.

| Hours | A: Orchestration | B: Agents | C: UI and delivery | D: Data and pitch | Checkpoint |
| --- | --- | --- | --- | --- | --- |
| 0–2 | Repo, `schemas.py`, API keys, `llm.py` with cache | Prompt drafts for Planner and Marker | Streamlit shell: upload and run button | Rubric, 3 anchors, task brief | Schemas frozen; a test call to Groq works |
| 2–6 | Graph: Planner → Marker → END; state saved to `runs/` | Marker prompt with evidence quotes; `checks.py` quote match | Trace panel reading `log.jsonl` live | 30 scripts with traps, `expected.json` | **H6: one script marked end to end with evidence** |
| 6–10 | Loop 1 edges, retry limit, recalibrate route | Calibration Reviewer, blind re-mark, drift stats; tune on anchors | Correction log view (before → after) | Check traps trigger; write demo script | **H10: loop catches a planted trap** |
| 10–14 | Diagnostician, Builder, Checker nodes; loop 2 | Prompts for those three; class-gap summary | Results page: per-learner card, task, feedback | Pitch slides from the existing deck | **H14: full run on 30 scripts** |
| 14–18 | Approval interrupt; Delivery node | Teacher brief prompt | SMTP email, .xlsx export, approve button | Record the first full run as a backup | **H18: feature freeze** |
| 18–21 | Bug fixes; warm the cache with the demo run | Prompt polish on failures only | UI polish; "needs teacher" badge | Backup video edited | Demo runs 3 times clean |
| 21–24 | Deploy to Streamlit Community Cloud | Stand by for fixes | Stand by for fixes | Rehearse the pitch 3 times; submit | **Submitted** |

## Risks and fallbacks

| Risk | Fallback |
| --- | --- |
| Free-tier rate limits hit during the demo | Demo runs from the warmed disk cache; Gemini key as a second provider; recorded backup video |
| Open model returns broken JSON | Pydantic validation plus one automatic "fix your JSON" retry; JSON mode where the provider supports it |
| Marker too inconsistent to calibrate | Add anchors as worked examples in the prompt; mark one criterion per call instead of all five |
| Loops never converge | Hard retry limit of 2, then "needs teacher" |
| Behind at H6 | Drop to 3 rubric criteria and 15 scripts |
| Behind at H14 | Merge Practice Builder and Checker into one node with a code-only check; skip email and show the outbox on screen |
| SMTP blocked on venue Wi-Fi | Show generated emails in an "Outbox" tab; send from a phone hotspot |
| Streamlit Cloud deploy fails | Demo from a laptop on localhost |

## Demo script (5 minutes)

1. **0:00 Problem (45 s).** Two slides: South African marking load and the LPC 4% pass rate. "Marks without a second check, results without a plan."
2. **0:45 Goal (15 s).** Upload the rubric, anchors and 30 scripts; type the one-line goal. No step-by-step instructions.
3. **1:00 Plan and act (45 s).** The trace shows the Planner splitting the work into 6 batches; Marker cards fill in with quoted evidence.
4. **1:45 Check and correct (75 s).** The key moment: the reviewer rejects the long off-topic essay and the evidence-free essay, with reasons in the log. Show the before and after marks next to `expected.json`.
5. **3:00 Diagnose and practise (45 s).** Open one struggling learner: root gap "structure", a matching catch-up task, and one task the Checker rejected and rebuilt.
6. **3:45 Approve and deliver (30 s).** Teacher brief on screen; click Approve; an email lands on a phone; open the .xlsx.
7. **4:15 Close (45 s).** Summary line from the real run, the five judging criteria ticked, and the LPC mode as next step.

Run the demo from the warmed cache, keep the backup video open in a tab, and use the real numbers from your final run in the summary line.
