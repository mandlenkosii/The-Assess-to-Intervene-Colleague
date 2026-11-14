# Pitch: Assess-to-Intervene Colleague (5 minutes)

**Junior** presents · **Lesedi** drives the demo laptop · **Owethu** runs the backup (video, and the live site).

Spoken words are in quotes. Everything in «angle quotes» is a number you **read from `data/demo-results.json`** after the final real run (`npm run results`). Never say a number that isn't in that file, and never use rehearsal numbers (from `FAKE_LLM` or `--fake`). The results script refuses to write those to `data/`.

**Where we demo from:** the **presentation laptop**, running locally (`npm start`) on the **warmed, cached run** with `DEMO_PACE_MS=600`. It unfolds in about 25–30 seconds and needs no network and no model quota. The live site (https://the-assess-to-intervene-colleague.vercel.app/) goes on the closing slide, and Owethu keeps it open as a second backup. Don't demo from the live site: Render's free tier sleeps after 15 minutes and loses its runs on every redeploy.

**Emails are preview-only.** No mail account is set, so delivery drafts every email and shows it in the Outbox as "preview · not sent". Nothing reaches a real inbox. Say so; never claim an email arrived.

---

## 0:00 – 0:45 · The problem (slides 1–2)

**On screen:** slide 1, the marking-season numbers; slide 2, "Marks without a second check. Results without a plan."

> "Every December, more than 52,000 teachers in South Africa mark over 14 million matric scripts in about two weeks. Half of our teachers are thinking about leaving the profession.
>
> And when a learner fails, what do they get? A number. Not a plan.
>
> AI can mark faster, but research shows AI markers drift to the middle and mark more generously than people do. So AI that marks alone just gives you fast, unchecked marks.
>
> We didn't build a chatbot. We built a colleague."

*Sources for slide 1 (put them on the slide):* DBE, 2025 NSC marking; TimesLIVE, Oct 2025 (SADTU survey); arXiv 2406.16510 on LLM graders.

## 0:45 – 1:00 · One goal, no instructions

**Lesedi:** the start screen is open, with the seven agents orbiting the goal. Point at the goal box, then click **Load class set**.

> "The teacher gives it one goal: *mark this class set, check the marks, and prepare catch-up plans for anyone who is struggling.* Thirty Grade 10 essays, a rubric, and three scripts the teacher has already marked. No step-by-step instructions."

## 1:00 – 1:45 · Plan and act

**On screen:** the stage rail moves through Plan and Act; in the orbit, the working agent lights up and **gold arcs** carry work between agents. **Lesedi** opens one script card when the first marks land.

> "Seven agents, each with one job, passing work to each other. Every gold line is a hand-off.
>
> First the Planner works out the job: thirty scripts, six batches, the pass mark, and a borderline band where it will be extra careful.
>
> Then the Marker gets to work, in parallel. Look at this card: every score comes with a quote copied word for word from the learner's essay. If it can't point to the evidence, it can't give the mark."

## 1:45 – 3:00 · Check and correct ← **the key moment**

**On screen:** the correction log; **pink arcs** in the orbit (Reviewer → Marker). **Lesedi** opens script **L024** (the off-topic essay).

> "This is where it stops being a script and starts being a colleague.
>
> A separate Reviewer checks every batch. It re-marks a sample blind, without seeing the first mark, and compares the batch to the teacher's own anchor scripts.
>
> Here: essay L024 is long, fluent, and about school uniforms, not cellphones. The Marker gave it «L024 first_pct» percent. The Reviewer caught it. The quote didn't exist in the essay. So it sent it back, with the reason, and the Marker corrected it to «L024 final_pct».
>
> Every pink line is the colleague fixing its own work. And when a whole batch drifts towards the middle, the Reviewer sends it all the way back to the Planner, which re-calibrates against the teacher's anchors and marks it again.
>
> When it still can't agree with itself after three tries, it doesn't guess. It flags the script for the teacher."

*If the run shows more or different corrections, name the one on screen, not this one. Only mention the Planner recalibration if it happened in this run (a Reviewer → Planner pink arc and a "recalibrated" line in the correction log).*

## 3:00 – 3:45 · Diagnose and practise

**Lesedi:** open the **Learners** tab and a learner whose task shows **Rebuilt after review**.

> "A mark isn't the end. The Diagnostician finds each learner's root gap. For this learner, it's «gap».
>
> The Builder writes a short catch-up task aimed at exactly that gap, with an answer key. And a Checker reviews the task too. This one was sent back because it practised the wrong skill, and rebuilt."

## 3:45 – 4:15 · The teacher decides, then it delivers

**Lesedi:** open the **Approval** tab and scroll the brief. Click **Approve and send**, then **Confirm and send**. Open the **Outbox** and expand one **Preview email**. Then click **Download teacher brief** and **Download marks workbook**.

> "Nothing has gone anywhere yet. The teacher reads a one-page brief: who needs help, why, and what the colleague wasn't sure about. The teacher can hold any learner back. Then approves.
>
> Every learner gets their feedback and their catch-up task, ready to send. Today it's in preview, so no real inbox gets a message. In a school, this goes straight to each learner. And the marks are in a spreadsheet, ready for the school's records."

## 4:15 – 5:00 · Close: real numbers, five criteria

**On screen:** the closing slide, filled from `npm run results` (the script prints these lines ready to paste), with the live link.

> "From one goal: «closing_line»
>
> It **reasons**: «criteria.reasons»
> It **self-corrects**: «criteria.self_corrects»
> It **executes**: «criteria.executes»
> It **collaborates**: «criteria.collaborates»
> And it **serves education**: «criteria.serves_education»
>
> Next: handwritten scripts. Teachers photograph a page; two different models read it, and any word they don't agree on is marked illegible instead of guessed. It's built and switched off until we've tested it on real pages. After that, the same engine for candidate attorneys preparing for the LPC exam, where the pass rate in one paper was four percent.
>
> Teachers don't need another chatbot. They need a colleague who checks its own work. Thank you."

*Don't demo handwriting or switch it on for the pitch. Its live check with Gemini hasn't been done yet.*

---

## Readiness checklist

**Blocker: one clean real run (Junior, as early as possible)**

The free Gemini quota can't finish a full run (about 170 model calls). When it runs out, marks come back "needs teacher" and no catch-up tasks are built. On 2026-11-14 the daily Gemini quota was already used up, and Groq alone is too slow.

- [ ] **Turn on billing for the Gemini key** in Google AI Studio. A run is about 170 short calls to `gemini-3.5-flash-lite`; check the cost on AI Studio's pricing page. *Or* wait for the daily quota to reset (midnight Pacific time, which is 10:00 SAST in November), knowing a free-tier run may still come back degraded.
- [ ] With billing on: `.env` `CONCURRENCY=4`, `DEMO_PACE_MS=0`, `FAKE_LLM=0`. `npm run ping` answers **without** "falling back to groq".
- [ ] `npm run warm` passes (run 2 under 60 s and ≥95% cached). Note the run id it prints.
- [ ] Open the warmed run and check it's demo-quality:
  - most marks are `ok`, not "needs teacher";
  - there are catch-up tasks;
  - L024 shows a correction;
  - at least one task shows **Rebuilt after review**.
  If any of these fail, run `npm run warm` again. Successful answers stay cached, so each pass only redoes what failed.
- [ ] `npm run results` writes `data/demo-results.json` (not a rehearsal). Fill the «» numbers into the closing slide and this script.
- [ ] Record the **backup video** from this real run (see `docs/demo-assets.md`). Never record a `FAKE_LLM` run as the backup: it isn't the product's real output.
- [ ] Copy `.cache/` and `runs/` to the presentation laptop if it isn't the machine that warmed. Both are gitignored, so they aren't in the repo.

**Live site as backup (Owethu, after the warm)**
- [ ] Don't merge to `main` from here on. A merge redeploys Render and wipes its runs.
- [ ] On the live site, click **Load class set** once and let it reach the approval gate. If Render uses the same Gemini key with billing on, this fills Render's own cache.
- [ ] 10 minutes before: open the live site so Render wakes up, then check **Open last run**.

**30 minutes before (everyone)**
- [ ] `.env`: `DEMO_PACE_MS=600`, `FAKE_LLM=0`. Then `npm run build && npm start`, and open http://localhost:3001.
- [ ] **Load class set** once. It must reach the approval gate in about 30 s with no live calls (the server log shows no "llm:" lines). Then reload the start screen.
- [ ] **Open last run** works (reopens the warmed run at the approval gate).
- [ ] Don't approve anything during these checks. **Open last run** opens the most recent run; if it's been approved, it opens a finished run. If someone approved, click **Load class set** once more and let it reach the gate.
- [ ] **Backup video** open in a browser tab (Owethu), muted, at 0:00.
- [ ] Laptop at 1280×720, notifications off, browser zoom at 100%, the terminal hidden.

**If something goes wrong on stage**
| Problem | Do this |
| --- | --- |
| Run stalls or errors | Lesedi clicks **Open last run** (the warmed run, already at the gate). Keep talking: "here's the run we did earlier." |
| Someone asks if the emails were sent | "Not today: it's in preview, so every email is drafted and shown here, and none was sent." Show the **Outbox**. |
| Laptop or app fails | Owethu plays the backup video, or opens the live site and **Open last run**. Junior narrates over it. |
| A number on the slide looks wrong | Only say what's in `data/demo-results.json`. Skip the number rather than guess. |

## Rehearsal plan (3 runs)

You can rehearse the flow and timing **now**, before the real run exists. Set `FAKE_LLM=1` and `DEMO_PACE_MS=600` in `.env`, then `npm run build && npm start`. The fake model makes the same kinds of mistakes, so L024 and the rebuilt tasks behave the same way. Never quote its numbers.

Rehearsal runs are saved like real ones, so **Open last run** will open a fake run until the real run is newer. Do the real `npm run warm` *after* rehearsing. Once it's warmed, rehearse with `FAKE_LLM=0`: the warmed cache replays the real run with no model calls.

1. **Run 1:** full 5 minutes with a timer, Lesedi driving. Note where you run long.
2. **Run 2:** practise the two recoveries: **Open last run** mid-demo, and switching to the backup video.
3. **Run 3:** after the real run is warmed: clean run against the clock with the real numbers. Final cut: if over 5:00, shorten 1:00–1:45 first, never 1:45–3:00.
