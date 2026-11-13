# Assess-to-Intervene Colleague: Game Plan for a Team of 3

Built on the two plans already in this repo. **The product, agents, review loops, data contracts, dataset traps and demo script stay the same.** This plan changes the stack to Node.js/Express with a React + three.js front end. It also gives every person both front-end and back-end work, and includes copy-paste prompts for every person in every phase.

> **Don't build a chatbot. Build a colleague.** The teacher gives one goal and some files. The colleague plans, marks, checks its own marks, fixes them, diagnoses learners, builds catch-up tasks, checks those too, waits for the teacher's approval, and then delivers. There is no chat box anywhere in the UI.

---

## 1. What we ship (MVP only)

By hour 24 the app must do one thing well, live: **30 scripts in → checked marks, feedback, catch-up tasks, teacher brief, marks .xlsx and emails out, with every self-correction shown on screen.**

**In**
- Upload a rubric, 3 anchor scripts with the teacher's marks, the scripts (TXT, PDF or DOCX) and `learners.csv`, or click **"Load demo class"**
- One goal box ("Mark this class set and prepare catch-up plans")
- 7 agents: Planner, Marker, Calibration Reviewer, Diagnostician, Practice Builder, Practice Checker, Delivery
- Loop 1 (marks) and Loop 2 (tasks), each with a retry limit of 2, after which the item is flagged **"needs teacher"**
- A live trace of the six stages (Goal, Plan, Act, Check, Correct, Deliver), a correction log and a small 3D view of the agents
- An approval gate, then delivery: emails (Gmail SMTP), `marks.xlsx` and the teacher brief

**Cut (do not build):** logins, a database server, chat, Google Classroom, handwriting OCR, LPC mode, a class gap chart, dark/light theme switching, settings pages and mobile layouts beyond "doesn't break".

---

## 2. Architecture (built for speed and reliability)

```
 Browser (Vite + React + three.js)                 Node 20 + Express (one process)
 ┌──────────────────────────────┐   POST /runs    ┌───────────────────────────────────────────┐
 │ Upload + Goal                │ ──────────────▶ │ routes/  → runStore (memory + runs/<id>/) │
 │ AgentScene (three.js, 1 canvas)│ ◀── SSE ───── │ orchestrator.js  (state machine + loops)  │
 │ Trace / Correction log       │   /events       │   ├─ agents/*.js   (one file per agent)   │
 │ Results + Approve + Outbox   │ ──────────────▶ │   ├─ checks.js     (free code checks)     │
 └──────────────────────────────┘ POST /approve   │   ├─ llm.js  Groq → Gemini, disk cache,   │
                                                  │   │          429 backoff, JSON repair     │
                                                  │   └─ delivery/  nodemailer, exceljs        │
                                                  └───────────────────────────────────────────┘
```

### Key decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Orchestration | **A small state machine we write ourselves** (`orchestrator.js`, about 200 lines), not LangGraph.js | No learning curve. The loops are plain `while` and retry counters, so they are easy to debug at 3 a.m. The Planner's output decides the batches and the Reviewer's verdict decides the route, so it is not a fixed script. |
| Live updates | **Server-Sent Events** (`GET /api/runs/:id/events`) | One-way, built into browsers, no socket library and no polling. |
| LLM | **Groq** through the `openai` npm package (OpenAI-compatible), with **Gemini** as the fallback | Free and fast. Model names live in `.env`, so switching is a config change. Use `response_format: {type:"json_object"}`. |
| Validation | **Zod** in `shared/schemas.js`, imported by both server and web | One source of truth. A bad model output triggers a "fix your JSON" retry instead of a crash. |
| Concurrency | **p-limit** (4 at a time; tune to your Groq limit) | Marks 30 scripts in parallel batches, which is the biggest speed win. |
| Cache | Disk cache keyed by `sha256(model+messages)` in `.cache/` | Re-runs and the demo cost $0 and finish in under a minute. |
| Storage | In-memory run object, written to `runs/<id>/state.json` and `log.jsonl` | No database to set up. |
| Files | `pdf-parse`, `mammoth` (DOCX), `csv-parse`, `multer` | Typed scripts only. |
| Delivery | `nodemailer` (Gmail app password), `exceljs` | Works in 10 minutes. |
| Deploy | Express serves `web/dist`, so there is **one process and one URL** | Demo on localhost; deploying is optional (Render free tier). |

### Performance rules (everyone follows these)
1. Run **code checks before model checks**: quote match, score ranges and sums are free and instant.
2. Blind re-mark only **20% of scripts plus every borderline script**, never all of them.
3. Re-mark only the **rejected scripts**, never the whole batch (the exception is drift, where the Planner recalibrates the batch).
4. Every LLM call goes through `llm.js` (cache → Groq → backoff → Gemini). No agent calls a provider directly.
5. Throttle SSE events to the UI to at most 20 per second. The UI appends events and never re-fetches state.
6. three.js: **one canvas**, about 7 meshes, no post-processing, `pixelRatio` capped at 1.5, rendering paused when the tab is hidden, and the scene lazy-loaded so the first paint isn't blocked.

### Repo layout
```
colleague-zero/
  package.json              # npm workspaces: server, web, shared; "dev" runs both
  .env.example              # GROQ_API_KEY, GROQ_MODEL_LARGE, GROQ_MODEL_SMALL, GEMINI_API_KEY, GEMINI_MODEL, SMTP_USER, SMTP_PASS, CONCURRENCY=4
  shared/schemas.js         # Zod: CriterionScore, Mark, Review, Diagnosis, Task, LogEvent, RunState
  server/
    index.js                # Express, static web/dist, routes
    routes/runs.js          # POST /runs, POST /runs/demo, GET /runs/:id, GET /runs/:id/events, POST /runs/:id/approve, GET /runs/:id/marks.xlsx
    runStore.js             # in-memory runs + persist + SSE broadcast (emit(runId, event))
    orchestrator.js         # the pipeline and both loops
    llm.js                  # cache, retries, fallback, JSON repair
    checks.js               # code checks + drift stats
    parse.js                # txt/pdf/docx/csv → text
    agents/  planner.js marker.js calibrator.js diagnostician.js builder.js checker.js delivery.js
    prompts/ *.md           # one prompt per agent
  web/
    src/main.jsx  App.jsx  theme.css
    src/lib/useRunEvents.js # SSE hook → reducer
    src/components/ UploadGoal.jsx  AgentScene.jsx  Trace.jsx  CorrectionLog.jsx  ScriptCard.jsx  LearnerCard.jsx  ApprovePanel.jsx  Outbox.jsx
  data/                     # rubric.json, anchors/, scripts/, learners.csv, expected.json
  runs/  .cache/            # gitignored
```

### Contracts (freeze at hour 2)

**Schemas:** use the Pydantic models from the Build Plan, translated to Zod one-to-one. Add `status: "ok" | "needs_teacher"` to `Mark` and `Task`.

**SSE event:** every agent action emits exactly one of these. It drives the trace, the correction log, the cards and the 3D scene.
```js
{ t, stage: "goal"|"plan"|"act"|"check"|"correct"|"deliver",
  agent: "planner"|"marker"|"calibrator"|"diagnostician"|"builder"|"checker"|"delivery"|"teacher",
  kind: "stage"|"log"|"mark"|"review"|"correction"|"diagnosis"|"task"|"status",
  ref?: "script_14" | "learner_07",
  message: "Script 14: argument 7 → 5, no evidence quoted",
  data?: { before?, after?, mark?, task?, ... } }
```
Run status events use `kind:"status"` with `data.status` set to `planning | marking | reviewing | intervening | awaiting_approval | delivering | done | error`.

---

## 3. Visual direction

| Token | Hex | Use |
| --- | --- | --- |
| `--butter` (primary) | `#F9E27D` | Main surfaces and accents, primary buttons, the active agent's glow, "accepted" ticks |
| `--butter-soft` | `#FFF6CC` | Page background, cards |
| `--aubergine` (secondary) | `#3F1D4A` | All text, headers, the 3D scene background, the top bar |
| `--aubergine-deep` | `#26102E` | Canvas background, footer |
| `--candy` (tertiary) | `#FF8FC7` | **Corrections only**: reject badges, before → after arrows and loop-back arcs in 3D. Pink means "the colleague caught itself." |
| `--candy-deep` | `#C2186B` | Text on butter that needs a pink voice (meets contrast; plain `--candy` text on butter does not) |

Rules: aubergine text on butter backgrounds (very high contrast). Never put white text on candy pink. Pink is reserved for self-correction, so the judges' eye goes straight to it. Fonts: Inter for UI and JetBrains Mono for the trace (Google Fonts).

**3D scene (the only 3D):** 7 low-poly icosahedron "agents" on a gentle arc across the top of the page, over an aubergine background. The active agent glows butter and pulses. When a `correction` event arrives, a candy-pink arc animates from the Reviewer back to the Marker (or from the Checker to the Builder, or from the Reviewer to the Planner). The approval gate is a ring that turns butter when approved. Hovering shows the agent's name. If WebGL is unavailable, show a static SVG of the same layout.

---

## 4. Team split: Junior, Lesedi and Owethu

Everyone owns a back-end slice **and** the UI for that slice, so nobody waits on anyone else, and each person can demo their own part.

| | **Junior: Spine** | **Lesedi: Marking and self-correction** | **Owethu: Intervention, delivery and 3D** |
| --- | --- | --- | --- |
| Back end | Express, routes, `runStore` + SSE, `llm.js`, `orchestrator.js`, Planner, approval gate | `parse.js`, Marker, `checks.js`, Calibration Reviewer, Loop 1 | Diagnostician, Builder, Checker, Loop 2, Delivery (email, xlsx, brief) |
| Front end | App shell, `theme.css`, `useRunEvents` hook, Upload + Goal screen, status bar | Trace timeline, ScriptCard (evidence quotes), CorrectionLog (before → after) | `AgentScene` (three.js), LearnerCard, ApprovePanel, Outbox |
| Data and demo | `shared/schemas.js`, repo, merges, cache warm-up, pitch lead | Dataset: rubric, anchors, 30 scripts with traps, `expected.json`, accuracy and trap tests | `learners.csv`, team Gmail + app password, backup video, final slides |

### Your checklist by phase

**Junior: Spine (lead, owns the repo, merges, pitch)**
- [ ] P0: monorepo + `npm run dev`, `shared/schemas.js`, `llm.js` (cache, backoff, Gemini fallback), `sample-events.jsonl`
- [ ] P1: `runStore` + SSE routes, Planner, orchestrator v1 · **UI:** `useRunEvents` hook, Upload + Goal screen
- [ ] P2: Loop 1 in the orchestrator (re-mark, replan on drift, retry limit, timeout) · **UI:** status pill with progress
- [ ] P3: Loop 2 wiring, approval gate + `/approve`, `npm run smoke` timings
- [ ] P4: warm the cache, `/runs/latest`, error sweep, single-port production build, tag the freeze
- [ ] P5: pitch script, pre-demo checklist, final cut decisions, submit

**Lesedi: Marking and self-correction (quality owner, drives the demo laptop)**
- [ ] P0: rubric, 3 anchors + teacher marks, Planner and Marker prompts
- [ ] P1: `parse.js`, Marker agent, `checks.js`, 30 scripts with traps + `expected.json` · **UI:** Trace timeline, ScriptCard
- [ ] P2: Calibration Reviewer (code checks, blind re-mark, drift), trap test · **UI:** CorrectionLog
- [ ] P3: accuracy tuning, loop-limit test, shorter prompts · **UI:** Scripts tab
- [ ] P4: final accuracy run → `demo-results.json` · **UI:** evidence highlighting in the script
- [ ] P5: full test suite, low-risk fixes only, pass/fail table

**Owethu: Intervention, delivery and 3D (owns the backup video and slides)**
- [ ] P0: Vite + React shell, `theme.css` palette, layout, SVG fallback, `learners.csv`
- [ ] P1: Diagnostician, Builder and Checker prompts · **UI:** three.js `AgentScene`
- [ ] P2: Diagnostician, Builder and Checker agents + try script · **UI:** AgentScene on live SSE
- [ ] P3: teacher brief, team Gmail app password · **UI:** LearnerCard, Learners tab
- [ ] P4: email sending + `marks.xlsx` + endpoints · **UI:** ApprovePanel, Outbox, approval ring
- [ ] P5: UI polish at 1280×720, 60fps check, backup video shot list

**Working agreements**
- Contracts (schemas, SSE event, routes) are frozen at H2. Junior changes them only with everyone's OK.
- Branches `junior/spine`, `lesedi/marking`, `owethu/intervene`. Small PRs, pushed every hour, and Junior merges at each checkpoint.
- Every agent is a pure function `async (input, ctx) => output`, where `ctx = { llm, emit, run }`. This lets Lesedi and Owethu build and test agents before the orchestrator exists.
- Everyone builds UI against **`data/sample-events.jsonl`** (a recorded fake run that Junior writes in phase 0). The front end never waits for the back end.
- A 10-minute stand-up at every checkpoint covering done, blocked and cut. Sleep slots: Owethu 12–15, Lesedi 15–18, Junior 18–21.

---

## 5. Phases

Each phase has a goal, a checkpoint and one ready-to-paste prompt per person for your coding assistant. Paste the **Shared context block** first in every new session.

### Shared context block (paste at the top of every prompt)
```
Project: "Assess-to-Intervene Colleague", a hackathon multi-agent education app (NOT a chatbot).
Teacher uploads rubric + 3 teacher-marked anchor scripts + 30 typed scripts + learners.csv and gives one goal.
Agents: Planner → Marker → Calibration Reviewer (reject → Marker, drift → Planner) → Diagnostician →
Practice Builder → Practice Checker (reject → Builder) → Teacher approval → Delivery. Retry limit 2, then "needs_teacher".
Stack: Node 20 ESM, Express, Zod (shared/schemas.js), openai npm pkg pointed at Groq (Gemini fallback), p-limit,
SSE for live events, nodemailer, exceljs, pdf-parse, mammoth. Front end: Vite + React (JS), three.js (one canvas only).
npm workspaces: server/, web/, shared/. Agents are pure: async (input, ctx) => output, ctx = { llm, emit, run }.
Every agent action emits an SSE event: { t, stage, agent, kind, ref?, message, data? } (see shared/schemas.js).
Colours: butter #F9E27D (primary), butter-soft #FFF6CC, aubergine #3F1D4A (secondary/text), aubergine-deep #26102E,
candy #FF8FC7 (tertiary, ONLY for self-corrections), candy-deep #C2186B.
Priorities: MVP only, performance, correctness. No extra features, no auth, no database, no chat UI.
Keep code small and readable. Don't add dependencies beyond the ones listed without saying why.
```

---

### Phase 0: Foundations (H0–H2)
**Goal:** the repo runs, the contracts are frozen, the first model call works and everyone can build against fake events.
**Checkpoint H2:** `npm run dev` opens a butter/aubergine page; `node server/scripts/ping.js` gets JSON back from Groq; `shared/schemas.js` and `data/sample-events.jsonl` are merged.

**Junior: Spine**
```
[Shared context block]
Phase 0, I am Junior, role: Spine. Set up the monorepo:
1. Root package.json with npm workspaces (server, web, shared) and a "dev" script that runs the Express server (port 3001,
   node --watch) and Vite (port 5173, proxy /api → 3001) together using concurrently.
2. shared/schemas.js: Zod schemas CriterionScore, Mark (+status "ok"|"needs_teacher", attempt), Review, Diagnosis,
   Task (+status, attempt), LogEvent (t, stage, agent, kind, ref?, message, data?), RunState. Export them plus JSON-schema-like
   prompt hints (a short text description of each shape) that agents can paste into prompts.
3. server/llm.js: createLLM() returning { json(messages, {schema, tier:"large"|"small", temperature}) }.
   Flow: sha256 cache lookup in .cache/ → Groq via openai SDK (baseURL https://api.groq.com/openai/v1,
   response_format json_object) → on 429 exponential backoff (3 tries) → fall back to Gemini (OpenAI-compatible endpoint)
   → parse + Zod validate → on failure ONE "Your JSON was invalid: <zod error>. Return only valid JSON." retry → throw.
   Models from env: GROQ_MODEL_LARGE, GROQ_MODEL_SMALL, GEMINI_MODEL. Log cache hits and misses.
4. server/scripts/ping.js that calls llm.json with a tiny schema.
5. .env.example, .gitignore (.env, runs/, .cache/, node_modules, dist), README with run steps.
6. data/sample-events.jsonl: ~60 realistic fake events for a full run (plan, marks with evidence, 3 reviewer rejections
   with before/after, diagnoses, one rejected and rebuilt task, awaiting_approval, delivery) so teammates can build UI now.
Keep it minimal. Show me the file tree at the end.
```

**Lesedi: Marking**
```
[Shared context block]
Phase 0, I am Lesedi, role: Marking and self-correction. Two jobs:
1. Dataset in data/: Grade 10 English argumentative essay, prompt "Should cellphones be allowed in South African
   classrooms?". Write rubric.json with 5 criteria (argument, evidence, structure, language, audience), each out of 20,
   with level descriptors. Write 3 anchor scripts (weak ~35%, middle ~58%, strong ~82%) in data/anchors/ with
   anchors.json holding the teacher's per-criterion marks and a one-line reason each.
2. server/prompts/planner.md and server/prompts/marker.md. The Marker must return per criterion: score, max_score,
   an EXACT verbatim quote from the script as evidence (copied character for character), and a reason; plus 80–150 words of
   learner feedback written to the learner. Include the anchors as worked examples. Include a "reviewer feedback from the
   previous attempt" slot that is empty on the first try.
Output the files. Keep scripts realistic South African Grade 10 voice, 250–450 words.
```

**Owethu: Intervention, delivery and 3D**
```
[Shared context block]
Phase 0, I am Owethu, role: Intervention, delivery and 3D. Set up the web app shell:
1. web/ with Vite + React. web/src/theme.css with CSS variables for the palette, Inter + JetBrains Mono from Google
   Fonts, body background butter-soft, text aubergine. Base styles for .card, .btn-primary (butter bg, aubergine text),
   .badge-correct (candy-deep text on a light pink tint), .badge-ok, .badge-needs-teacher.
2. App.jsx layout: top bar (aubergine) with the product name and a run status pill; a 220px-tall hero area reserved for
   the 3D scene; below that a 3-column grid (Trace | Main panel | Correction log) that stacks on narrow screens.
3. A placeholder <AgentScene/> that renders a static SVG of 7 labelled circles on an arc (this becomes the WebGL fallback).
4. data/learners.csv: 30 rows (learner_id, name (fictional South African names), grade 10, email). Leave email
   as placeholders TEAM_INBOX_1..3 rotated, and I'll fill in real team inboxes.
No routing library, no UI kit. Small and fast.
```

---

### Phase 1: Thin slice (H2–H6)
**Goal:** one script goes end to end (upload → Planner → Marker → shown on screen with evidence), streamed live.
**Checkpoint H6:** click "Load demo class" and watch the trace fill and at least one ScriptCard show 5 criteria with quotes.

**Junior: Spine**
```
[Shared context block]
Phase 1, I am Junior, role: Spine. Build the run lifecycle and the thin slice.
1. server/runStore.js: create(runInput) → runId; get(id); emit(id, event) which validates with LogEvent, appends to
   run.log, appends to runs/<id>/log.jsonl, and pushes to all SSE subscribers; persist(id) writes state.json (debounced 500ms).
2. server/routes/runs.js:
   POST /api/runs (multer: rubric, anchors[], anchorMarks, scripts[], learners) and POST /api/runs/demo (loads data/);
   both start orchestrator.run(runId) without awaiting and return {runId}.
   GET /api/runs/:id → state snapshot. GET /api/runs/:id/events → SSE: replay existing log first, then live events,
   heartbeat every 15s, clean up on close.
3. server/agents/planner.js: deterministic batching (batches of 5), pass mark 50, borderline band 40–55, plus ONE llm
   call (prompts/planner.md) that turns the rubric into a normalised criteria list. Emits stage "plan" events
   describing the plan in plain words.
4. server/orchestrator.js v1: goal event → planner → for now mark only the FIRST script with agents/marker.js (Lesedi builds it,
   import it) → status done. Set status events at each step.
5. web/src/lib/useRunEvents.js: opens EventSource, reduces events into { status, events[], marks{}, reviews{},
   corrections[], diagnoses{}, tasks{}, activeAgent }. Batch state updates with requestAnimationFrame.
6. web/src/components/UploadGoal.jsx: a goal textarea pre-filled with "Mark this class set against the rubric, check
   the marks, and prepare catch-up plans for anyone who is struggling.", a file inputs section, and a big butter
   "Load demo class" button. On start it calls the API and switches to the run view.
```

**Lesedi: Marking**
```
[Shared context block]
Phase 1, I am Lesedi, role: Marking. Build the marker path and its UI.
1. server/parse.js: toText(file) for .txt, .pdf (pdf-parse), .docx (mammoth); normaliseWhitespace(); loadLearners(csv).
2. server/agents/marker.js: markScript({scriptId, text, rubric, anchors, feedback?, attempt}, ctx) → Mark.
   Uses ctx.llm.json with the Mark schema, tier "large", temperature 0.2. Computes total_pct in code (never trust the model's
   arithmetic). Emits stage "act" kind "mark" with data.mark.
3. server/checks.js: quoteExists(quote, text) (whitespace and quote-character normalised, case-insensitive; also accept
   if ≥90% of the quote's tokens appear contiguously), scoresInRange(mark, rubric), totalMatches(mark).
   checkMark(mark, text, rubric) → { ok, reasons[] }.
4. data/scripts/: the 30 scripts. 22 ordinary (25–85% spread) + traps: long off-topic, short excellent, fluent no evidence,
   2 borderline (~45%), 2 weak only on structure. data/expected.json = our own per-script totals plus which check each trap
   should trigger.
5. web/src/components/Trace.jsx: a vertical timeline grouped by the 6 stages (Goal, Plan, Act, Check, Correct, Deliver) with
   stage headers, monospace messages, agent chips, auto-scroll that pauses when the user scrolls up. Render only the
   last 300 events (simple windowing).
6. web/src/components/ScriptCard.jsx: total %, 5 criterion rows with score/max, the evidence quote in a quote block, the reason,
   and the learner feedback collapsed by default.
Build the UI against data/sample-events.jsonl first (add a ?mock=1 mode to useRunEvents that replays it).
```

**Owethu: Intervention, delivery and 3D**
```
[Shared context block]
Phase 1, I am Owethu, role: 3D and intervention prompts.
1. web/src/components/AgentScene.jsx with three.js (lazy-loaded with React.lazy + dynamic import so first paint isn't blocked):
   - one WebGLRenderer, alpha false, background aubergine-deep, pixelRatio min(devicePixelRatio, 1.5), antialias on
   - 7 IcosahedronGeometry(radius 0.35, detail 0) meshes with flat MeshStandardMaterial in butter, on a shallow arc,
     labelled with HTML overlays (not 3D text); a torus "approval gate" before Delivery
   - one ambient + one directional light, a slow idle bob; the active agent (prop activeAgent) scales 1.25 and gets emissive butter
   - export a method / prop "pulseLoop(from, to)" that animates a candy-pink TubeGeometry arc between two agents over 900ms
   - pause the render loop on document.hidden; dispose everything on unmount; resize with ResizeObserver
   - if WebGL fails, render the existing SVG fallback
   Keep it under ~180 lines. No post-processing, no OrbitControls, no model loading.
2. server/prompts/diagnostician.md, builder.md, checker.md. Diagnostician: root_gap tied to the weakest rubric criteria,
   severity on_track/watch/needs_help, evidence quotes from the learner's marks. Builder: instructions under 120 words,
   3–5 questions at Grade 10 level aimed only at the gap, an answer key with one answer per question. Checker: does the task
   target the diagnosed gap, is the level right; return accept/reject with reasons.
Wire AgentScene to sample-events (activeAgent from the latest event; correction events trigger pulseLoop).
```

---

### Phase 2: Loop 1, the colleague checks and fixes its marks (H6–H10)
**Goal:** all 30 scripts are marked in parallel, reviewed, and rejected ones are re-marked with a reason. This is the most important phase for judging.
**Checkpoint H10:** a live run shows the off-topic trap and the no-evidence trap rejected in candy pink, then corrected, with before → after values.

**Junior: Spine**
```
[Shared context block]
Phase 2, I am Junior, role: Spine. Implement Loop 1 in server/orchestrator.js.
- Mark all scripts with p-limit(CONCURRENCY), batch by batch as the Planner planned.
- After each batch: call calibrator.reviewBatch (Lesedi builds it). For each rejected script with attempt < 3, re-mark ONLY that
  script, passing the reviewer's reasons as feedback; emit stage "correct" kind "correction" with data {before, after, reasons}.
  When attempts are exhausted, set mark.status "needs_teacher" and emit an event saying so.
- If the reviewer reports drift (anchors disagree by more than 10 points, or the batch is clustered in the middle), route back to the
  Planner: planner.recalibrate adds the anchors as worked examples and records a "replan" event; re-mark that batch once.
  Guard against loops with a run-level replan limit of 1.
- Status events: marking → reviewing. Persist after each batch.
- Add a hard run timeout (12 min) that ends gracefully with status error and a message.
Also: web status pill shows status + a progress count (marked/total, corrected count).
```

**Lesedi: Marking**
```
[Shared context block]
Phase 2, I am Lesedi, role: Marking. Build the Calibration Reviewer and the correction log UI.
1. server/agents/calibrator.js: reviewBatch({marks, scripts, anchors, plan}, ctx) → { reviews: Review[], drift: {flag, reason} }.
   Order: code checks first (checks.checkMark), so any failure is an instant reject with the reason
   "no evidence quoted for <criterion>" or "scores don't add up". Then blind re-mark (prompts/calibrator.md, temperature 0,
   different framing, does NOT see the first mark) for a seeded random 20% plus every script in the borderline band;
   reject if the totals differ by more than 10 points or any criterion differs by more than 2. Return both marks in the reasons.
   Drift: compare anchor re-marks with the teacher's marks (more than 10 points = drift), and batch std-dev vs anchor
   std-dev, or more than 60% of totals in 45–65%.
   Emit stage "check" events for every accept and reject (short messages).
2. web/src/components/CorrectionLog.jsx: one row per correction: script id, agent, before → after (candy arrow),
   reasons as bullets, attempt number, and a "needs teacher" badge when status says so. Count shown in the header.
3. tests/trap.test.js (node:test): run the pipeline on the dataset from cache and assert each trap in expected.json was
   rejected at least once and ended within 10 points of our mark. Print an accuracy table.
Tune the thresholds on the anchors only.
```

**Owethu: Intervention, delivery and 3D**
```
[Shared context block]
Phase 2, I am Owethu, role: Intervention. Build the three intervention agents as pure functions (the orchestrator wires them in phase 3).
1. server/agents/diagnostician.js: diagnose({marks, rubric, plan}, ctx) → Diagnosis[] for every learner. Compute severity
   in code first (below the pass mark = needs_help, in the borderline band = watch, else on_track) and use ONE llm call per
   needs_help/watch learner for root_gap + evidence. Also return classGaps: the 2 weakest criteria by class average (computed in code).
2. server/agents/builder.js: buildTask({diagnosis, rubric, feedback?, attempt}, ctx) → Task (tier "large" for quality).
3. server/agents/checker.js: checkTask({task, diagnosis}, ctx) → Review. Code checks first: answer_key.length === questions.length,
   instructions ≤ 120 words, 3–5 questions. Then the model check for gap match and level.
4. Write a tiny script server/scripts/try-intervention.js that runs these on 3 hand-made marks so I can test without the
   orchestrator.
5. AgentScene: hook it up to real SSE (via useRunEvents); the reviewer→marker and reviewer→planner arcs fire on matching
   correction and replan events.
```

---

### Phase 3: Loop 2 and the full run (H10–H14)
**Goal:** the full pipeline runs on all 30 scripts: diagnoses, tasks and the Checker loop, stopping at `awaiting_approval`.
**Checkpoint H14:** one full live run with no crashes, under 10 minutes; the results page shows learner cards with tasks.

**Junior: Spine**
```
[Shared context block]
Phase 3, I am Junior, role: Spine. Wire Loop 2 and the approval gate.
- orchestrator: after Loop 1, run diagnostician → for every learner with severity !== on_track, buildTask → checkTask,
  in parallel with p-limit. On reject: rebuild with reasons (max 2 rebuilds), emit "correction" events (agent "checker",
  data before/after), else status "needs_teacher".
- Then generate the teacher brief draft (Owethu's delivery.brief), set status "awaiting_approval" and STOP. The run object waits.
- POST /api/runs/:id/approve {approved: true, excluded?: [learnerIds]} → resumes into delivery. Reject a call when the status isn't
  awaiting_approval. Nothing sends before this.
- End-to-end smoke test: npm run smoke runs the demo class headlessly, prints timings per stage, total LLM calls, cache hits,
  correction count. Optimise the slowest stage (usually concurrency or a prompt that's too long).
```

**Lesedi: Marking**
```
[Shared context block]
Phase 3, I am Lesedi, role: Marking. Quality pass and the results views.
1. Run tests/trap.test.js on a full live run. Fix prompts, not thresholds, unless a trap passes wrongly.
   Target: 27 of 30 scripts within 10 points of expected.json, and 100% of criterion scores with a verbatim quote.
2. Loop limit test: an env flag FORCE_REJECT=1 makes the reviewer always reject, and we assert the script ends as needs_teacher
   after 2 retries with no infinite loop.
3. web: a "Scripts" tab in the main panel: a sortable compact table (learner, total %, status, corrected?) where clicking
   opens the ScriptCard. Corrected rows get a small candy dot. Keep it virtualisation-free; 30 rows is fine.
4. Shorten every prompt you own by removing anything the model doesn't need (it speeds up every call).
```

**Owethu: Intervention, delivery and 3D**
```
[Shared context block]
Phase 3, I am Owethu, role: Intervention UI.
1. web/src/components/LearnerCard.jsx: name, total %, severity badge (on_track butter, watch outlined, needs_help aubergine),
   root gap, the catch-up task (instructions, numbered questions, answer key collapsed), and, if the task was rebuilt,
   a small candy "rebuilt after review" note with the checker's reason.
2. "Learners" tab in the main panel: needs_help first, then watch, then on_track.
3. server/agents/delivery.js part 1: brief({run}) → markdown one-page teacher brief: headline numbers, who needs help and why
   (grouped by gap), the 2 class-wide gaps, corrections made, and the scripts flagged needs teacher. Small model, one call; the
   numbers are computed in code and passed in, never generated.
4. Team Gmail: 2-step verification + app password into .env (SMTP_USER/SMTP_PASS). Only send to team inboxes.
```

---

### Phase 4: Approval and delivery, then the feature freeze (H14–H18)
**Goal:** the teacher reviews and approves; emails go out; the .xlsx and brief can be downloaded.
**Checkpoint H18: FEATURE FREEZE.** After this, only bug fixes.

**Junior: Spine**
```
[Shared context block]
Phase 4, I am Junior, role: Spine.
1. Warm the cache: run the demo class twice from scratch, confirm the second run is under 1 minute with ~100% cache hits.
2. Add GET /api/runs/latest so the demo can reopen the warmed run instantly.
3. Error handling sweep: any agent throw → emit an error event with a human message, mark the item needs_teacher, continue
   the run (never crash the whole run for one script).
4. Production: Express serves web/dist; npm run build && npm start works on one port. Add a /api/health route.
5. Merge all branches; tag v0.9-freeze.
```

**Lesedi: Marking**
```
[Shared context block]
Phase 4, I am Lesedi, role: Marking.
1. Final trap and accuracy run; write the real numbers to data/demo-results.json (scripts marked, corrections, traps caught,
   accuracy vs expected, run time) for the closing slide.
2. web: evidence highlighting. In ScriptCard, a "show in script" toggle renders the script text with every evidence quote
   highlighted in butter (corrected ones underlined candy). Simple string matching using the same normaliser as checks.js.
3. Fix any prompt failures from the full runs. Stop adding features at H18.
```

**Owethu: Intervention, delivery and 3D**
```
[Shared context block]
Phase 4, I am Owethu, role: Delivery.
1. server/agents/delivery.js part 2: sendAll(run) via nodemailer (Gmail SMTP, pool: true, maxConnections 3): one email
   per learner with their feedback + catch-up task (simple inline-styled HTML in the palette), skipping excluded and
   needs_teacher learners; emit a "deliver" event per email. marksXlsx(run) via exceljs: one row per learner (per-criterion
   scores, total %, status, corrected?, root gap), header row in aubergine with butter text. Save the brief to runs/<id>/brief.md.
2. GET /api/runs/:id/marks.xlsx and /brief endpoints (Junior owns routes; add them in routes/runs.js and tell Junior).
3. web/src/components/ApprovePanel.jsx: appears at awaiting_approval with the brief rendered, summary counts, a list of
   needs_teacher items, checkboxes to exclude learners, and a big butter "Approve and send" button (requires a confirm click).
4. web/src/components/Outbox.jsx: every generated email listed (to, subject, status sent/failed/skipped). If SMTP fails, the
   Outbox still shows the content. That's our venue Wi-Fi fallback.
5. AgentScene: approval ring turns butter and Delivery pulses on approval.
```

---

### Phase 5: Harden, demo and submit (H18–H24)
**Goal:** three clean runs in a row, a backup video, a rehearsed 5-minute pitch.
**Checkpoint H21:** three clean runs. **H24:** submitted.

**Junior: Spine** (asleep 18–21)
```
[Shared context block]
Phase 5, I am Junior, role: Spine and pitch lead.
Help me write a 5-minute pitch script following this order: problem (SA marking load, LLM graders drift to the middle) →
goal typed in one line → plan appears → marking with evidence → the reviewer catching the traps live (pink) → diagnosis and
a rebuilt task → teacher approves → email lands on a phone and the .xlsx opens → close with real numbers from
data/demo-results.json mapped to the five judging criteria (Reasons, Self-corrects, Executes, Collaborates, Serves education).
Then give me a pre-demo checklist: warmed cache, latest run id, backup video tab, phone hotspot, team inbox open on a phone.
```

**Lesedi: Marking** (drives the demo laptop)
```
[Shared context block]
Phase 5, I am Lesedi, role: Quality.
Run the full test suite (schema, evidence, trap, accuracy, loop-limit, fallback with GROQ_API_KEY unset, delivery to team
inboxes, 3 cached demo runs). For each failure: find the root cause, propose the smallest fix, and apply it only if it's
low risk. No new features. Output a final pass/fail table I can paste into the README.
```

**Owethu: Intervention, delivery and 3D**
```
[Shared context block]
Phase 5, I am Owethu, role: Polish and demo assets.
1. UI polish only: consistent spacing (8px grid), focus states on buttons, the empty state before a run starts, and a loading
   skeleton for cards. Check that the 3D scene stays at 60fps on a laptop with throttling, and if not, lower geometry detail or
   stop the idle animation.
2. Make sure the page works at 1280×720 (projector size) with no scrolling needed for the trace and correction log during
   the key demo moment.
3. Help me write a shot list for a 3-minute backup video of a clean cached run, matching the pitch order.
```

---

## 6. Cut list if a checkpoint slips (Junior decides at stand-up)

Never cut Loop 1, Loop 2 or the approval gate. They are the product.

| Missed | Cut |
| --- | --- |
| H6 | 3 rubric criteria and 15 scripts; file upload falls back to "Load demo class" only |
| H10 | Drop the drift → Planner route; keep the code checks and blind re-mark |
| H14 | Merge Builder and Checker into one call with code-only checks; the 3D scene stays as the SVG fallback |
| H18 | Outbox only (no real SMTP); demo on localhost; no evidence highlighting |

## 7. Definition of done

A teacher clicks "Load demo class" (or uploads files), types one goal and watches the agents work in the 3D strip and trace. They can see pink corrections with before → after values and reasons, open any mark and its quoted evidence, open any struggling learner's diagnosis and checked catch-up task, approve, and receive emails, `marks.xlsx` and a one-page brief. No developer is needed at any step. A cached rerun takes under 1 minute.
