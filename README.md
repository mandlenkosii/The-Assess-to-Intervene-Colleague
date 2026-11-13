# Assess-to-Intervene Colleague

A team of AI agents that marks a class set against a rubric, checks and corrects its own marks, and turns the results into catch-up tasks for struggling learners, with the teacher approving before anything is sent. Full plan: [Colleague Zero Game Plan](Colleague%20Zero%20Game%20Plan%20(Team%20of%203,%20Node%20+%20three.js).md).

## Requirements

- Node.js 20+
- npm 10+

## Run it

```bash
npm install
cp .env.example .env      # Windows: Copy-Item .env.example .env; then add your own keys
npm run ping              # one model call → validated JSON (H2 checkpoint)
npm run dev               # API on :3001, web on :5173 (Vite proxies /api)
```

The UI shell works without model or email credentials. If port 5173 is busy, Vite picks the next free port; check the terminal output. Never commit `.env` or send credentials in chat.

**No API keys?** Set `FAKE_LLM=1` in `.env`. The app then runs on a deterministic fake model that makes the mistakes the review loops are meant to catch, so you can watch a full run in the browser.

| Script | What it does |
| --- | --- |
| `npm run dev` | Express (`node --watch`) + Vite together |
| `npm run ping` | Health-check model call through `server/llm.js` (`-- --cache` to allow the cache) |
| `npm run smoke` | Headless demo run with per-stage timings, model calls and corrections (`-- --fake`, `-- --approve`, `-- --latency=300`) |
| `npm run warm` | **Before the demo:** runs the demo class twice; passes when run 2 is under 60 s and ≥95% cached (`-- --fake` to rehearse) |
| `npm run results` | Measures the latest real run (accuracy, traps, corrections, timings) → `data/demo-results.json` and the pitch closing line. Rehearsal runs never write there |
| `npm run sample-events` | Regenerates `data/sample-events.jsonl`, a fake full run to build the UI against |
| `npm test` | Node test runner over the server and marking tests |
| `npm run build && npm start` | Production: Express serves `web/dist` and the API on one port |

## Demo day

1. `npm run warm` with the demo API keys in `.env`, then `npm run results` for the pitch numbers. Full script and checklist: [docs/pitch.md](docs/pitch.md).
2. Set `DEMO_PACE_MS=600`, then `npm run build && npm start` and open the app. **Open last run** reopens the warmed run instantly, even after a restart.
3. If a run is cut off by a restart it is marked interrupted. Click **Load demo class** again, and it is served from the cache.

## Layout

```
shared/schemas.js   Zod contracts (frozen at H2): Mark, Review, Diagnosis, Task, BriefSummary, LogEvent, Plan, RunState
server/llm.js       The only model client: disk cache → Groq → 429 backoff → Gemini → Zod validate → 1 JSON repair
server/index.js     Express entry; app.js builds it; routes/runs.js has the run API
server/orchestrator.js  Planner → Marker ⇄ Reviewer → Diagnostician → Builder ⇄ Checker → approval gate → Delivery
server/agents/      One file per agent: async (input, ctx) => output, ctx = { llm, emit, run }
web/                Vite + React + three.js
data/               Rubric, anchors, scripts, learners.csv, sample-events.jsonl
runs/ .cache/       Run state/logs and the model cache (gitignored)
```

## Marking foundation

The marking slice includes learner CSV validation, TXT/PDF/DOCX text extraction, rubric checks, a rubric-constrained Marker, and a Calibrator that checks marks and blind-re-marks a deterministic sample. `data/scripts.js` and `data/expected.json` provide 30 synthetic scripts and expected rubric totals for tests. The marking tests run with `npm test`.

The teacher UI includes a six-stage live trace, expandable rubric evidence with exact-quote highlights, and a correction log.

The learner CSV uses the team's `TEAM_INBOX_1`–`TEAM_INBOX_3` placeholders. They are not deliverable addresses; the delivery agent rejects these placeholders if email delivery is enabled.

## Team rules

- Every model call goes through `createLLM().json(messages, { schema, tier })`. Never call a provider directly.
- `shared/schemas.js` is frozen; changes need everyone's OK.
- Branches: `junior/*`, `lesedi/*`, `owethu/*`. Junior merges at each checkpoint.
- Learner records in `data/learners.csv` are fictional. `TEAM_INBOX_1`–`TEAM_INBOX_3` are placeholders, not valid email destinations.
