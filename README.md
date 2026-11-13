# Assess-to-Intervene Colleague

A team of AI agents that marks a class set against a rubric, checks and corrects its own marks, and turns the results into catch-up tasks for struggling learners, with the teacher approving before anything is sent. Full plan: [Colleague Zero Game Plan](Colleague%20Zero%20Game%20Plan%20(Team%20of%203,%20Node%20+%20three.js).md).

## Run it

Needs Node 20 or newer.

```bash
npm install
cp .env.example .env      # add your own GROQ_API_KEY and GEMINI_API_KEY
npm run ping              # one model call → validated JSON (H2 checkpoint)
npm run dev               # API on :3001, web on :5173 (Vite proxies /api)
```

If port 5173 is busy, Vite picks the next free port; check the terminal output.

| Script | What it does |
| --- | --- |
| `npm run dev` | Express (`node --watch`) + Vite together |
| `npm run ping` | Health-check model call through `server/llm.js` (`-- --cache` to allow the cache) |
| `npm run sample-events` | Regenerates `data/sample-events.jsonl`, a fake full run to build the UI against |
| `npm run build && npm start` | Production: Express serves `web/dist` on one port |

## Layout

```
shared/schemas.js   Zod contracts (frozen at H2): Mark, Review, Diagnosis, Task, LogEvent, Plan, RunState
server/llm.js       The only model client: disk cache → Groq → 429 backoff → Gemini → Zod validate → 1 JSON repair
server/index.js     Express (/api/health; run routes from phase 1)
server/agents/      One file per agent: async (input, ctx) => output, ctx = { llm, emit, run }
web/                Vite + React (+ three.js from phase 1)
data/               Rubric, anchors, scripts, learners.csv, sample-events.jsonl
runs/ .cache/       Run state/logs and the model cache (gitignored)
```

## Team rules

- Every model call goes through `createLLM().json(messages, { schema, tier })`. Never call a provider directly.
- `shared/schemas.js` is frozen; changes need everyone's OK.
- Branches: `junior/spine`, `lesedi/marking`, `owethu/intervene`. Junior merges at each checkpoint.
- Never commit `.env`. Use synthetic data only.
