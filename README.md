# Assess-to-Intervene Colleague (Colleague Zero)

**Live app:** https://the-assess-to-intervene-colleague.vercel.app/
**API:** https://the-assess-to-intervene-colleague.onrender.com/api/health

A team of seven AI agents that marks a class set against a rubric, checks and corrects its own marks, finds each learner's main gap, and writes a catch-up task for every learner who needs one. The teacher reads a short brief and approves before any feedback is sent.

Full plan: [Colleague Zero Game Plan](Colleague%20Zero%20Game%20Plan%20(Team%20of%203,%20Node%20+%20three.js).md). Pitch script and checklist: [docs/pitch.md](docs/pitch.md).

---

## Why it's needed

Marking a class set of 30 essays takes a teacher hours. The marks then sit in a spreadsheet, and the learners who struggled rarely get targeted help in time. The gap between **assessing** and **intervening** is where learners fall behind.

Colleague Zero closes that gap:

- **It saves time.** One goal sentence starts the whole job: marking, review, diagnosis, catch-up tasks and feedback emails.
- **It can be trusted.** Every mark quotes evidence from the learner's script. A second agent re-marks a sample blind and rejects marks that drift from the teacher's own anchor marks. Corrections are logged in the open.
- **It turns marks into action.** Each struggling learner gets a task aimed at their root gap, and a separate agent checks the task before it can ship.
- **The teacher stays in charge.** Nothing is sent until the teacher approves. The teacher can leave learners out, and uncertain marks are flagged for the teacher to review.

## What it does

### The seven agents

| Agent | Job |
| --- | --- |
| **Planner** | Reads the goal and rubric and plans the marking batches |
| **Marker** | Marks each script against the rubric, quoting evidence |
| **Reviewer** (calibrator) | Re-marks a sample blind, compares it with the teacher's anchor scripts, and sends drifting marks back to the Marker |
| **Diagnostician** | Finds each learner's root gap from their marks |
| **Builder** | Writes a catch-up task for each gap |
| **Checker** | Checks every task and sends weak ones back to the Builder |
| **Delivery** | Sends feedback, but only after the teacher approves |

Flow: `Planner → Marker ⇄ Reviewer → Diagnostician → Builder ⇄ Checker → teacher brief → approval gate → Delivery`

The `⇄` loops are the self-correction: work that fails review goes back and is redone, and the change is recorded in the correction log.

### What the teacher sees

- **Goal screen.** A dark 3D orbit (three.js) of the seven agents around the goal, with animated packets showing hand-offs between them. The goal box, **Load class set** (the built-in Grade 10 English set: 30 essays, a rubric and 3 teacher-marked anchors) and an optional upload for your own files. Every click starts a new run; **New run** on the run screen goes back here.
- **Live run.** The orbit lights up the agent that is working. A stage rail shows progress, and a live trace streams each agent's steps as they happen (server-sent events, which resume after a dropped connection).
- **Learners tab.** Marks per learner with rubric evidence (exact quotes highlighted), "needs teacher review" flags, and the correction log.
- **Approval tab.** The teacher brief, the option to exclude learners from delivery, and **Approve delivery**.
- **Outbox tab.** Each feedback email and its status. Downloads: the teacher brief and a marks workbook (`.xlsx`).

### Email preview mode

If `SMTP_USER` and `SMTP_PASS` are not set, nothing is emailed. Delivery drafts each message and marks it **"preview · not sent"** in the Outbox. The live deployment runs this way, so a demo never emails anyone. The learner data is fictional, and the `TEAM_INBOX_1`–`TEAM_INBOX_3` placeholders in `data/learners.csv` are rejected as destinations.

## How to use it

### On the live site

1. Open https://the-assess-to-intervene-colleague.vercel.app/
   - The API is on Render's free tier and sleeps after 15 minutes idle. The first request can take about 50 seconds to wake it, so open the site a minute early.
2. Keep the default goal or type your own, then click **Load class set**.
3. Watch the agents work. Open the trace to see corrections as they happen.
4. When the run reaches **awaiting approval**, read the brief in the **Approval** tab, exclude anyone you want, and click **Approve delivery**.
5. Check the **Outbox**, and download the brief or the marks workbook.

Render's free disk is wiped on every restart or redeploy, so the real model answers for the demo class are committed in `data/demo-cache/` and copied into the cache at startup. **Load class set** replays them with no model quota.

**Your own class:** expand the file section on the goal screen and upload:
- a rubric or memo (`.json`, `.txt`, `.md`, `.pdf`, `.docx`);
- 2–3 teacher-marked anchor scripts and their `anchors.json`;
- one script per learner (`.txt`, `.pdf`, `.docx`);
- `learners.csv`.

### Locally

Requirements: Node.js 20+ and npm 10+.

```bash
npm install
cp .env.example .env      # Windows: Copy-Item .env.example .env, then add your own keys
npm run ping              # one model call → validated JSON
npm run dev               # API on :3001, web on :5173 (Vite proxies /api)
```

If port 5173 is busy, Vite picks the next free port; check the terminal. Never commit `.env` or paste keys in chat.

**No API keys?** Set `FAKE_LLM=1` in `.env`. The app then runs on a deterministic fake model. It makes the mistakes the review loops are built to catch, so you can watch a full run.

| Script | What it does |
| --- | --- |
| `npm run dev` | Express (`node --watch`) and Vite together |
| `npm run ping` | Health-check model call through `server/llm.js`; prints the primary provider and model (`-- --cache` allows the cache) |
| `npm run smoke` | Headless run with per-stage timings, model calls and corrections (`-- --fake`, `-- --approve`, `-- --latency=300`) |
| `npm run warm` | **Before a demo:** runs the class twice. Passes when run 2 is under 60 s and at least 95% cached (`-- --fake` to rehearse) |
| `npm run results` | Measures the latest real run (accuracy, traps, corrections, timings) and writes `data/demo-results.json` plus the pitch closing line. Rehearsal runs never write there |
| `npm run sample-events` | Regenerates `data/sample-events.jsonl`, a fake full run to build the UI against |
| `npm test` | Node test runner over the server and marking tests |
| `npm run build && npm start` | Production: Express serves `web/dist` and the API on one port |

## Handwritten scripts (feature flag, off by default)

**Why:** many South African classrooms still write by hand. With `FEATURE_HANDWRITING=true`, a teacher can upload phone photos or scans instead of typing every script.

**Turn it on:** set `FEATURE_HANDWRITING=true` (in `.env` locally, or in Render's environment) and restart. Set it back to `false` to turn it off; the app then behaves exactly as before.

**How it works:**
1. Under **Or use your own class files**, a **Handwritten scripts** field appears. Add one `.jpg`, `.jpeg`, `.png` or image-only `.pdf` per learner, named by learner id (for example `L001.jpg`). Photos are shrunk in the browser before upload.
2. **Read handwriting** sends them to the Transcriber. Two different models read each page independently: Gemini (`GEMINI_VISION_MODEL`) and Groq (`GROQ_VISION_MODEL`). Code keeps only the words both agree on; every other word becomes `[illegible]`, so nothing is guessed. PDFs are read by Gemini twice, because Groq can't open PDFs, and are labelled "single-model".
3. **Self-check:** if more than `HANDWRITING_ILLEGIBLE_MAX` (default 15%) of the words are illegible, the readings disagree on more than `HANDWRITING_DISAGREE_MAX` (default 20%), or a model fails, the script is flagged **transcription needs teacher** and logged at stage `correct`.
4. **Review:** each photo is shown next to its transcription. The teacher edits the text; flagged scripts must be edited or ticked as checked before **Start marking** unlocks.
5. Marking runs as a normal upload. The Marker treats `[illegible]` as missing, never as wrong, and says so in the feedback.

Typed TXT, PDF and DOCX files never go through this path. Images stay in memory and are never written to disk. Test only with synthetic or anonymised handwriting (see `server/tests/fixtures/handwriting/`); never commit real learner images. Each handwritten script costs about two vision model calls.

## Models

All model calls go through `server/llm.js`. **Gemini is the primary model and Groq is the fallback.**

- Flow: disk cache → primary provider → retries on 429/5xx (3 tries, waits up to 15 s) → fallback provider → Zod validation → one "fix your JSON" repair turn.
- `LLM_PRIMARY=gemini` (default) or `groq` sets which provider answers first.
- Defaults: `GEMINI_MODEL=gemini-3.5-flash-lite`, `GROQ_MODEL_LARGE=openai/gpt-oss-120b`, `GROQ_MODEL_SMALL=openai/gpt-oss-20b`. Groq's gpt-oss models run at low reasoning effort to save tokens.
- Answers are cached in `.cache/`, keyed on the primary model. A repeat run is fast, and pacing (`DEMO_PACE_MS`) slows it down so the audience can follow it.

**Why Gemini first:** Groq's free tier allows about 8k tokens a minute per model, and a full run makes about 170 model calls, so Groq-only runs stalled on rate limits. Gemini flash-lite allows more calls a minute, and Groq stays as the backup.

**Known limit:** on free tiers, a full run can still hit rate limits. When it does, some learners are marked "needs teacher" instead of failing the run. For reliable runs, enable billing on the Gemini key, then raise `CONCURRENCY` to 4.

## Deployment (Vercel front end + Render API)

**Why two hosts:** a run lasts several minutes, streams over SSE and keeps state on disk. Vercel functions can't hold that, so the Express API runs as a normal Node service on Render. Vercel serves the built UI and forwards `/api/*` to Render (see `vercel.json`).

| | URL |
| --- | --- |
| Front end (Vercel) | https://the-assess-to-intervene-colleague.vercel.app/ |
| API (Render) | https://the-assess-to-intervene-colleague.onrender.com |

**Render (Web Service).** Build command `npm install`, start command `npm start`, health check `/api/health`. Environment variables:

| Variable | Value |
| --- | --- |
| `NODE_VERSION` | `24` |
| `GEMINI_API_KEY` / `GROQ_API_KEY` | your keys (set only in Render, never in the repo) |
| `LLM_PRIMARY` | `gemini` |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` |
| `GROQ_MODEL_LARGE` / `GROQ_MODEL_SMALL` | `openai/gpt-oss-120b` / `openai/gpt-oss-20b` |
| `CONCURRENCY` | `2` on free tiers, `4` with Gemini billing |
| `LLM_TIMEOUT_MS` | `60000` |
| `NO_CACHE` / `FAKE_LLM` | `0` / `0` |
| `DEMO_PACE_MS` | `600` by default, so a replayed demo is watchable (`0` = off) |
| `PORT`, `SMTP_*` | leave unset (Render sets the port; no SMTP keeps email in preview) |

**Vercel.** Import the repo with framework preset **Other**. `vercel.json` sets the install and build commands, the output folder (`web/dist`) and the `/api` rewrite. No environment variables are needed. The install command also adds the Linux rollup and esbuild binaries, because the lockfile is generated on Windows and leaves them out. If the Render URL changes, update it in `vercel.json`.

**Redeploys:** a push to `main` redeploys both sites and wipes Render's disk. Don't push to `main` just before or during the pitch.

## Demo day

1. Wake the API (open the live site or `/api/health`), then load the class set once to warm the cache. Locally, use `npm run warm`, then `npm run results` for the pitch numbers.
2. `DEMO_PACE_MS` defaults to 600, so the replayed run unfolds on screen in about 35 seconds.
3. Present with **Load class set**. It replays the shipped real run (`data/demo-cache/`).
4. If a restart cuts a run off, it is marked interrupted. Click **Load class set** again; it is served from the cache.

## Layout

```
shared/schemas.js        Zod contracts: Mark, Review, Diagnosis, Task, BriefSummary, LogEvent, Plan, RunState
server/llm.js            The only model client: cache → Gemini → retries → Groq fallback → Zod → 1 JSON repair
server/index.js          Express entry; app.js builds the app; routes/runs.js has the run API
server/orchestrator.js   Planner → Marker ⇄ Reviewer → Diagnostician → Builder ⇄ Checker → approval → Delivery
server/agents/           One file per agent: async (input, ctx) => output, ctx = { llm, emit, run }
web/                     Vite + React + three.js (AgentScene.jsx is the orbit; theme.css is the dark theme)
data/                    Rubric, anchors, scripts, learners.csv, sample-events.jsonl
vercel.json              Vercel build and the /api rewrite to Render
runs/ .cache/            Run state and logs, and the model cache (gitignored)
```

**API routes** (all under `/api`): `GET /health`, `GET /features`, `POST /transcriptions` and `GET /transcriptions/:id` (handwriting flag only), `POST /runs/demo`, `POST /runs` (upload), `GET /runs/latest`, `GET /runs/:id`, `GET /runs/:id/events` (SSE), `POST /runs/:id/approve`, `GET /runs/:id/brief`, `GET /runs/:id/marks.xlsx`.

## Marking foundation

The marking slice includes:
- learner CSV validation;
- TXT/PDF/DOCX text extraction;
- rubric checks;
- a rubric-constrained Marker;
- a Calibrator that checks marks and blind-re-marks a fixed sample.

`data/scripts.js` and `data/expected.json` provide 30 synthetic scripts and their expected rubric totals for the tests.

## Team rules

- Every model call goes through `createLLM().json(messages, { schema, tier })`. Never call a provider directly.
- `shared/schemas.js` is frozen; changes need everyone's OK.
- Branches: `junior/*`, `lesedi/*`, `owethu/*`. Junior merges at each checkpoint.
- Data is synthetic only. Learner records are fictional, and `TEAM_INBOX_1`–`TEAM_INBOX_3` are placeholders, not real addresses.
- Keys live only in `.env` (gitignored) and in Render's environment settings.
