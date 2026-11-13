# Assess-to-Intervene Colleague: PRD and 24-Hour Implementation Plan (Team of 3)

Nov 13, 2026 · @Victor

## Summary

We are building the Assess-to-Intervene Colleague, a team of AI agents that marks a class set of scripts against a rubric, checks and corrects its own marks, and turns the results into a catch-up plan for every struggling learner. The first users are South African teachers marking class tests and NSC preparation work. The same engine extends to candidate attorneys preparing for the LPC competency-based exam. Three people will build a working demo in 24 hours on a free stack: LangGraph, Groq (Gemini as backup), Streamlit and Gmail SMTP.

## Problem and users

Marking takes up a large share of teachers' time, the marks are rarely checked for consistency, and a learner who fails gets a number instead of a plan.

- **Marking load:** over 52,000 Grade 12 teachers marked more than 14 million NSC scripts between 28 November and 13 December 2025 ([DBE](https://www.education.gov.za/ArchivedDocuments/ArchivedArticles/2025NSCExamsMarking.aspx)). Half of South African teachers are considering leaving within 10 years ([TimesLIVE](https://www.timeslive.co.za/news/south-africa/2025-10-22-teachers-are-burnt-out-sadtu-calls-for-more-mental-health-support-as-matric-exams-begin/)).
- **Board-exam fairness:** in the March 2024 LPC exam, Attorneys' Practice and Legal Ethics had a 4% pass rate, and the Legal Services Ombud blamed the LPC ([News24](https://www.news24.com/southafrica/news/lpc-caused-untold-misery-why-ombud-blames-council-for-4-pass-rate-in-legal-competency-exams-20241223)).
- **AI marking alone is not enough:** studies find LLM graders cluster around middle marks or mark higher than humans ([arXiv](https://arxiv.org/pdf/2406.16510), [THE](https://www.timeshighereducation.com/node/744645)). That is why the self-checking loop is central to the product.
- **Flags without follow-through:** schools and universities flag at-risk students, but often nobody owns what happens next ([Wonkhe](https://wonkhe.com/?p=176859)).

| User | Need | What they get |
| --- | --- | --- |
| Teacher (primary) | Mark a class set fast and fairly; know who needs help | Marks with quoted evidence, a correction log, a one-page brief, catch-up tasks |
| Learner | Clear feedback and a next step | Personal feedback and a short task aimed at their gap |
| Head of department or moderator | Trust that marks are consistent | Calibration against anchor scripts; an audit trail of every correction |
| Candidate attorney (stretch) | Know which LPC sections to fix before the next sitting | Mock-paper marking, section diagnosis, study plan |

## Goals and success metrics

The goal for the hackathon is one clean live run that scores on all five judging criteria. The targets below are ours, measured on our own demo dataset.

| Judging criterion | How we show it | Target for the demo run |
| --- | --- | --- |
| Reasons | Planner splits the goal and re-plans when a batch drifts | Plan visible in the trace; at least 1 re-plan or recalibration event |
| Self-corrects | Two review loops with logged reasons | All 3 planted marking traps caught and corrected |
| Executes | Finished outputs, actually sent | 30 scripts marked, emails sent, .xlsx and brief produced |
| Collaborates | Seven agents with clear handoffs | Every handoff shown in the trace |
| Serves education | A real South African need | Every learner under the threshold gets a task aimed at their gap |

**Quality targets:** final marks within 10 percentage points of the team's own marks on at least 90% of scripts; every criterion score backed by a verbatim quote; full run under 10 minutes live, or under 1 minute from cache.

## User stories

| # | As a… | I want to… | So that… | Priority |
| --- | --- | --- | --- | --- |
| 1 | Teacher | upload a rubric, 2–3 marked anchor scripts and a class set, then give one goal | I don't have to direct each step | Must |
| 2 | Teacher | see every mark with the quote that justifies it | I can trust or challenge it quickly | Must |
| 3 | Teacher | see which marks the colleague corrected, and why | I know it checked its own work | Must |
| 4 | Teacher | get a one-page brief of who needs help and why | I can plan the next lesson | Must |
| 5 | Teacher | approve before anything is sent | I stay responsible for results | Must |
| 6 | Learner | receive feedback and one short catch-up task | I know exactly what to fix | Must |
| 7 | Teacher | download a marks spreadsheet | I can load marks into our records | Must |
| 8 | Teacher | see scripts the colleague couldn't settle marked "needs teacher" | nothing uncertain goes out unchecked | Must |
| 9 | Teacher | see class-wide gaps | I can reteach a topic to everyone | Stretch |
| 10 | Candidate attorney | upload a mock LPC answer and get a section-by-section diagnosis | I know what to study before the next sitting | Stretch |

## Requirements

**Must have (MVP by hour 24)**

1. Upload a rubric/memo, anchor scripts with teacher marks, scripts (PDF, DOCX, TXT) and `learners.csv`.
2. Planner splits the work into batches of 5 and sets the pass mark and borderline band.
3. Marker scores each rubric criterion with a verbatim evidence quote and writes 80–150 words of feedback.
4. Calibration Reviewer runs code checks (quote exists, scores in range, totals add up), blind re-marks 20% of scripts plus all borderline ones, and compares anchors with the teacher's marks.
5. Rejected marks go back to the Marker with a reason, at most 2 times; then they are marked "needs teacher".
6. Diagnostician gives each learner a root gap and a severity.
7. Practice Builder writes a short task with an answer key; Practice Checker accepts it or sends it back (at most 2 rebuilds).
8. Live trace of the six stages (Goal, Plan, Act, Check, Correct, Deliver) and a correction log.
9. Teacher approval screen; nothing is sent before approval.
10. Delivery: an email per learner, a marks .xlsx and a teacher brief.

**Stretch (only after the hour-18 freeze is met)**

- Class-wide gap summary in the brief
- LPC mode: mock paper, LPC syllabus sections, 40–49% borderline flag
- Handwritten scripts via a vision model; Google Classroom delivery

**Out of scope:** logins and accounts, multiple schools, real learner data, issuing official results.

**Non-functional**

| Area | Requirement |
| --- | --- |
| Cost | $0: free tiers and open-source tools only |
| Speed | Live run under 10 minutes; cached demo run under 1 minute |
| Reliability | Every model output validated with Pydantic; one automatic retry on bad JSON; Gemini fallback on rate limits |
| Transparency | Every correction logged with a reason; every mark shows its evidence |
| Privacy | Synthetic or anonymised scripts only; API keys in `.env`, never committed |
| Human control | Teacher approval before delivery; uncertain scripts are flagged, never guessed |

## Architecture and stack

One Python app with seven agent nodes in a LangGraph graph, two review loops and a human approval step. The full agent table, data schemas, review thresholds and diagram are in Assess-to-Intervene Colleague: 24-Hour Build Plan; this team plan uses them unchanged.

**Flow:** Planner → Marker → Calibration Reviewer (back to Marker on reject; back to Planner on drift) → Diagnostician → Practice Builder → Practice Checker (back to Builder on reject) → Teacher approval → Delivery.

| Layer | Tool (all free) |
| --- | --- |
| Agent orchestration | LangGraph |
| Models | Groq free tier (open models); Gemini free tier as fallback |
| UI and live trace | Streamlit, hosted on Streamlit Community Cloud |
| Delivery | Gmail SMTP with an app password; openpyxl for .xlsx |
| Parsing, validation, storage | pypdf, python-docx, Pydantic, JSON files and SQLite |

**Repo:** `app.py` (UI), `graph.py` (graph and loops), `agents/` (one file per agent), `prompts/`, `checks.py` (code checks), `llm.py` (client, cache, fallback), `schemas.py`, `data/`, `runs/`.

## Team of 3: who owns what

Junior leads the product and holds the pipeline together; the other two each own one half of the system. If someone's strengths fit another role better, swap the names; keep the split.

| Person | Email and GitHub | Role | Owns | Files | Also does |
| --- | --- | --- | --- | --- | --- |
| Junior | jjuniorsikhosana@gmail.com | Lead: product and orchestration | Scope calls, LangGraph graph, shared state, loops and retry limits, approval interrupt, model client with cache and fallback, integration, GitHub repo owner | `graph.py`, `llm.py`, `schemas.py` | Presents the pitch; makes every cut decision at checkpoints; merges pull requests |
| Modikwe | analystmodikwe18@gmail.com | Agents and quality | All seven prompts, code checks, threshold tuning on anchors, Diagnostician and practice loop, all tests | `agents/`, `prompts/`, `checks.py`, `tests/` | Runs the trap and accuracy tests; drives the live demo laptop |
| Owethu | Jezileowethu@gmail.com | Experience, data and demo | Streamlit UI and trace, approval screen, email and .xlsx delivery, synthetic dataset with traps, pitch slides, backup video | `app.py`, `agents/delivery.py`, `data/` | Owns the backup video and the 5-minute demo script |

**Working agreements**

- Schemas are frozen at hour 2. Changing one needs the Lead's OK.
- Push to `main` every hour in small commits; the Lead merges.
- 10-minute stand-up at every checkpoint: done, blocked, cut.
- Each person sleeps 3 hours between hours 12 and 21, staggered so at least two are always awake.

## Getting started (first 30 minutes)

Junior owns the GitHub repo; Modikwe and Owethu join as collaborators using the emails above, which are also their GitHub accounts.

1. **Junior creates the repo.** On GitHub, create a private repo `colleague-zero` with a Python `.gitignore` and add `.env` to it. Go to Settings → Collaborators → Add people and invite analystmodikwe18@gmail.com and Jezileowethu@gmail.com.
2. **Modikwe and Owethu accept** the invite from their email or the GitHub notifications page.
3. **Everyone sets up locally** (Python 3.11 or newer and Git installed):

```bash
git clone https://github.com/<junior-username>/colleague-zero.git
cd colleague-zero
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # then paste your own keys into .env
streamlit run app.py
```

4. **API keys.** Each person creates their own free Groq key (console.groq.com) and Gemini key (Google AI Studio) for development, so one person's testing doesn't use up another's limits. Junior keeps one separate pair for the demo. Keys live only in `.env`, never in Git.
5. **Email for delivery.** Owethu creates a team Gmail for sending (not a personal inbox), turns on 2-step verification, and creates an app password for `SMTP_PASSWORD` in `.env`. Send test emails only to the three team inboxes.
6. **Branches.** One branch each: `junior/graph`, `modikwe/agents`, `owethu/ui`. Commit small, push hourly, open a pull request, and Junior merges into `main` at each checkpoint.
7. **Track work.** Junior turns the task backlog below into GitHub Issues, each assigned to its owner, on a GitHub Projects board with To do, Doing and Done columns.
8. **One chat group** for the three of you; post "done / blocked / cut" at every checkpoint.

## 24-hour timeline

The checkpoints decide everything. At each one the Lead runs the stand-up, and if a checkpoint is missed, cuts from the Risks list before moving on. Sleep slots: Owethu at 12–15, Modikwe at 15–18, Junior at 18–21.

| Hours | Junior (Lead) | Modikwe (Agents) | Owethu (Experience and data) | Checkpoint |
| --- | --- | --- | --- | --- |
| 0–2 | Repo, `.env`, Groq and Gemini keys, `schemas.py`, `llm.py` with disk cache | Planner and Marker prompt drafts | Rubric, 3 teacher-marked anchors, Streamlit shell with upload | **H2: schemas frozen, first model call works** |
| 2–6 | Graph: Planner → Marker → end; state saved to `runs/` | Marker with evidence quotes; `checks.py` quote match and ranges | 30 synthetic scripts with traps, `expected.json`, `learners.csv`; trace panel reads `log.jsonl` | **H6: one script marked end to end with evidence** |
| 6–10 | Loop 1 edges: reject → Marker, drift → Planner; retry limit and "needs teacher" | Calibration Reviewer: blind re-mark, anchor check, drift stats; tune thresholds | Correction log view (before → after with reason); per-script mark card | **H10: loop catches a planted trap on screen** |
| 10–14 | Diagnostician, Builder and Checker nodes; loop 2 | Prompts for those three; teacher brief prompt | Results page: learner card with feedback and task; start pitch slides | **H14: full run on all 30 scripts** |
| 14–18 | Approval interrupt; Delivery node wired; warm the cache | Asleep 15–18 (fixes prompts on failures before then) | (Asleep 12–15) SMTP email, .xlsx export, approve button, "needs teacher" badge | **H18: feature freeze** |
| 18–21 | Asleep 18–21 | Fix failures from 3 full test runs; check trap results against `expected.json` | Deploy to Streamlit Cloud; record backup video of a clean run | **H21: three clean runs in a row** |
| 21–24 | Rehearse the pitch 3 times; final cut decisions; submit | Drive the demo laptop in rehearsal | Final slides; backup video ready in a tab | **H24: submitted** |

## Task backlog

Tick tasks off as they land. Groups follow the checkpoints; each line ends with its owner.

**Setup (H2)**

- [ ] Repo, `requirements.txt`, `.env.example`, README run steps — Junior
- [ ] Groq and Gemini keys tested; `llm.py` with cache, 429 retry and fallback — Junior
- [ ] `schemas.py` frozen: Mark, Review, Diagnosis, Task, LogEvent, RunState — Junior
- [ ] Rubric with 5 criteria and 3 teacher-marked anchors — Owethu

**Marking path (H6)**

- [ ] Planner node: batches of 5, pass mark, borderline band — Junior
- [ ] Marker prompt and node with evidence quotes and feedback — Modikwe
- [ ] `checks.py`: quote match, score ranges, total sum — Modikwe
- [ ] 30 scripts with 7 planted traps, `expected.json`, `learners.csv` — Owethu
- [ ] Trace panel streaming `log.jsonl` — Owethu

**Self-correction (H10)**

- [ ] Calibration Reviewer: anchor agreement, blind re-mark, drift stats — Modikwe
- [ ] Loop 1 edges, retry limit of 2, "needs teacher" status — Junior
- [ ] Correction log view, before and after with reason — Owethu

**Intervention (H14)**

- [ ] Diagnostician prompt and node — Modikwe, wired by Junior
- [ ] Practice Builder and Checker prompts and nodes; loop 2 — Modikwe, wired by Junior
- [ ] Learner result cards in the UI — Owethu

**Delivery (H18)**

- [ ] Teacher brief prompt — Modikwe
- [ ] Approval interrupt in the graph — Junior
- [ ] Approve button, SMTP sender, .xlsx export, Outbox tab — Owethu

**Demo (H21–H24)**

- [ ] Warm cache from a full run — Junior
- [ ] Deploy to Streamlit Community Cloud — Owethu
- [ ] Backup video of a clean run — Owethu
- [ ] Pitch slides and 3 rehearsals — Junior with everyone

## Testing and definition of done

Test against our own expected marks, not against the model's opinion of itself.

| Test | How | Pass when |
| --- | --- | --- |
| Schema test | Run each agent on one script; validate with Pydantic | No validation errors after one retry |
| Evidence test | `checks.py` on all marks | 100% of criterion scores have a verbatim quote |
| Trap test | Full run, compare with `expected.json` | All 3 marking traps rejected and corrected; borderline scripts re-marked |
| Accuracy test | Final totals vs. the team's own marks | Within 10 points on at least 27 of 30 scripts |
| Loop limit test | Force a reviewer that always rejects | Script ends as "needs teacher" after 2 retries; no infinite loop |
| Fallback test | Disable the Groq key mid-run | Run continues on Gemini or from cache |
| Delivery test | Approve a run to team inboxes | Emails arrive; .xlsx opens; brief renders |
| Demo test | Three full runs from cache | Three clean runs in a row under 1 minute each |

**Done means:** a teacher can upload files, type one goal, watch the six stages and corrections live, approve, and receive emails, a spreadsheet and a brief, with no step needing a developer.

## Risks and what we cut first

If a checkpoint slips, the Lead cuts in this order. Never cut the review loops or the approval step; they are the product.

| Missed checkpoint | Cut |
| --- | --- |
| H6 | Drop to 3 rubric criteria and 15 scripts |
| H10 | Drop the drift check; keep code checks and blind re-mark |
| H14 | Merge Practice Builder and Checker into one node with a code-only check |
| H18 | Skip real email; show an Outbox tab. Skip deployment; demo on localhost |

| Risk | Mitigation |
| --- | --- |
| Free-tier rate limits during the demo | Disk cache warmed at H18; Gemini fallback; backup video |
| Broken JSON from open models | Pydantic validation plus one "fix your JSON" retry |
| Marker too inconsistent | Anchors added as worked examples; mark one criterion per call |
| Only three people, someone gets stuck | Stand-up at every checkpoint; the Lead pairs with whoever is blocked for 30 minutes, then cuts |
| Venue Wi-Fi blocks SMTP or is slow | Phone hotspot; Outbox tab; cached run |
