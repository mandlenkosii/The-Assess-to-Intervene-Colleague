# Pitch: Assess-to-Intervene Colleague (5 minutes)

**Junior** presents · **Lesedi** drives the demo laptop · **Owethu** runs the backup (video, and the live site).

Spoken words are in quotes. Everything in «angle quotes» is a number you **read from `data/demo-results.json`** after the final real run (`npm run results`). Never say a number that isn't in that file, and never use rehearsal numbers (from `FAKE_LLM` or `--fake`). The results script refuses to write those to `data/`.

**Where we demo from:** the live site (https://the-assess-to-intervene-colleague.vercel.app/). Click **Load class set**: it starts a new run that replays the real model answers shipped in `data/demo-cache/`, so it needs no model quota. The presentation laptop (`npm start`) is the backup and replays the same answers. Set `DEMO_PACE_MS=600` (Render → Environment, and `.env` on the laptop) so the run unfolds in about 20–30 seconds instead of under a second.

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

**On screen:** the correction log; **pink arcs** in the orbit (Reviewer → Marker). **Lesedi** opens script **L028** (a borderline essay the Reviewer rejected).

> "This is where it stops being a script and starts being a colleague.
>
> A separate Reviewer checks every batch. It re-marks a sample blind, without seeing the first mark, and compares the batch to the teacher's own anchor scripts.
>
> Here: essay L028 sits right on the pass line. The Marker gave it 58 percent. The Reviewer re-marked it blind, disagreed, and sent it back with its reasons, and the mark moved to 67. In this run the Reviewer rejected 7 marks and 11 marks changed.
>
> Every pink line is the colleague fixing its own work. And when a whole batch drifts towards the middle, the Reviewer sends it all the way back to the Planner, which re-calibrates against the teacher's anchors and marks it again.
>
> When it still can't agree with itself after three tries, it doesn't guess. It flags the script for the teacher."

*These numbers are from the shipped run (`data/demo-results.json`); every Load class set replays it, so they're what appears on screen. If the screen ever shows something different, name what's on screen. Only mention the Planner recalibration if it happened in this run (a Reviewer → Planner pink arc and a "recalibrated" line in the correction log).*

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

**On screen:** the closing slide with these lines and the live link. They come from `data/demo-results.json`, minus the accuracy and trap figures (see the checklist).

> "From one goal: 30 scripts marked, 11 marks corrected after review, and 4 catch-up plans, all waiting for the teacher's approval.
>
> It **reasons**: the Planner split 30 scripts into 6 batches, and re-planned when the marks drifted from the teacher's anchors.
> It **self-corrects**: the Reviewer rejected 7 marks, and 11 marks changed.
> It **executes**: 30 of 30 scripts marked, 4 tasks, a teacher brief and a marks workbook.
> It **collaborates**: 7 agents, 48 hand-offs.
> And it **serves education**: every struggling learner got a checked catch-up task aimed at their gap.
>
> Next: handwritten scripts. Teachers photograph a page; two different models read it, and any word they don't agree on is marked illegible instead of guessed. It's built and switched off until we've tested it on real pages. After that, the same engine for candidate attorneys preparing for the LPC exam, where the pass rate in one paper was four percent.
>
> Teachers don't need another chatbot. They need a colleague who checks its own work. Thank you."

*Don't demo handwriting or switch it on for the pitch. Its live check with Gemini hasn't been done yet.*

---

## Readiness checklist

**Done (2026-11-14):** one clean real run, without billing (the app switches between free models when one is busy). Its model answers are committed in `data/demo-cache/` and loaded by the server at startup, so every **Load class set** replays it, on the live site and on any laptop, even after a redeploy. Numbers: `data/demo-results.json`.

**What to say, and what not to (from `data/demo-results.json`):**
- Say: 30/30 scripts marked; 7 marks rejected by the Reviewer, 11 changed; 1 recalibration by the Planner; 4 catch-up tasks for the 4 struggling learners; a teacher brief and a marks workbook.
- Don't claim accuracy or trap numbers. In this run only 18/30 marks are within 10 points of the team's marks and 1/7 planted traps were caught. If asked: "the Reviewer catches disagreements and flags them for the teacher; matching a teacher's marks more closely is what we're improving next."

**Before the pitch**
- [ ] Render → Environment: `DEMO_PACE_MS=600`, so the replay is watchable. Saving restarts the server; that's fine, because the shipped answers are loaded again.
- [ ] 10 minutes before: open the live site so Render wakes up (about a minute). Click **Load class set** once and check that it reaches the approval gate in about 30 s.
- [ ] Backup laptop: `.env` `DEMO_PACE_MS=600`, `FAKE_LLM=0`, then `npm run build && npm start` and open http://localhost:3001. **Load class set** must reach the gate with no "llm:" lines in the server log.
- [ ] Changing the demo inputs or the agent prompts changes the model calls, so the shipped answers no longer match. Then run `npm run warm`, copy `.cache/*.json` into `data/demo-cache/`, and run `npm run results`.
- [ ] Record the **backup video** from a replayed real run (see `docs/demo-assets.md`). Never record a `FAKE_LLM` run.
- [ ] **Backup video** open in a browser tab (Owethu), muted, at 0:00.
- [ ] Laptop at 1280×720, notifications off, browser zoom at 100%, the terminal hidden.

**If something goes wrong on stage**
| Problem | Do this |
| --- | --- |
| Run stalls or errors | Lesedi clicks **New run** (on the run screen), then **Load class set**. It replays in about 30 s. Keep talking. |
| Someone asks if the emails were sent | "Not today: it's in preview, so every email is drafted and shown here, and none was sent." Show the **Outbox**. |
| Live site is down | Switch to the backup laptop (same run, same numbers). Last resort: Owethu plays the backup video and Junior narrates. |
| A number on the slide looks wrong | Only say what's in `data/demo-results.json`. Skip the number rather than guess. |

## Rehearsal plan (3 runs)

You can rehearse the flow and timing **now**, before the real run exists. Set `FAKE_LLM=1` and `DEMO_PACE_MS=600` in `.env`, then `npm run build && npm start`. The fake model makes the same kinds of mistakes, so L024 and the rebuilt tasks behave the same way. Never quote its numbers.

The real run is already shipped, so you can rehearse with `FAKE_LLM=0` too: **Load class set** replays the real run with no model calls. Every rehearsal is a new run, and approving one never affects the next.

1. **Run 1:** full 5 minutes with a timer, Lesedi driving. Note where you run long.
2. **Run 2:** practise the two recoveries: **New run** → **Load class set** mid-demo, and switching to the backup laptop or video.
3. **Run 3:** on the live site with `DEMO_PACE_MS=600`: clean run against the clock with the real numbers. Final cut: if over 5:00, shorten 1:00–1:45 first, never 1:45–3:00.
