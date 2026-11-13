# Pitch: Assess-to-Intervene Colleague (5 minutes)

**Junior** presents · **Lesedi** drives the demo laptop · **Owethu** holds the phone and has the backup video ready.

Spoken words are in quotes. Everything in «angle quotes» is a number you **read from `data/demo-results.json`** after the final real run (`npm run results`). Never say a number that isn't in that file, and never use rehearsal numbers (from `FAKE_LLM` or `--fake`). The results script refuses to write those to `data/`.

The demo is the **warmed, cached run** with `DEMO_PACE_MS=600`, so it unfolds in about 25–30 seconds with no network risk. See the checklist at the end.

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

**Lesedi:** on the start screen, show the goal box, then click **Load demo class**.

> "The teacher gives it one goal: *mark this class set, check the marks, and prepare catch-up plans for anyone who is struggling.* Thirty Grade 10 essays, a rubric, and three scripts the teacher has already marked. No step-by-step instructions."

## 1:00 – 1:45 · Plan and act

**On screen:** the trace fills in; the 3D agents light up one by one. **Lesedi** opens one script card when the first marks land.

> "First the Planner works out the job: thirty scripts, six batches, the pass mark, and a borderline band where it will be extra careful.
>
> Then the Marker gets to work, in parallel. Look at this card: every score comes with a quote copied word for word from the learner's essay. If it can't point to the evidence, it can't give the mark."

## 1:45 – 3:00 · Check and correct ← **the key moment**

**On screen:** the correction log; the pink arcs in the 3D view. **Lesedi** opens script **L024** (the off-topic essay).

> "This is where it stops being a script and starts being a colleague.
>
> A separate Reviewer checks every batch. It re-marks a sample blind, without seeing the first mark, and compares the batch to the teacher's own anchor scripts.
>
> Here: essay L024 is long, fluent, and about school uniforms, not cellphones. The Marker gave it «L024 first_pct» percent. The Reviewer caught it. The quote didn't exist in the essay. So it sent it back, with the reason, and the Marker corrected it to «L024 final_pct».
>
> Every pink line is the colleague fixing its own work. And when the whole batch drifted towards the middle, the Reviewer sent it all the way back to the Planner, which re-calibrated against the teacher's anchors and marked it again.
>
> When it still can't agree with itself after three tries, it doesn't guess. It flags the script for the teacher."

*If the live run shows more or different corrections, name the one on screen, not this one.*

## 3:00 – 3:45 · Diagnose and practise

**Lesedi:** open the **Learners** tab and a learner whose task was rebuilt (a card with the "rebuilt after review" note).

> "A mark isn't the end. The Diagnostician finds each learner's root gap. For this learner, it's «gap».
>
> The Builder writes a short catch-up task aimed at exactly that gap, with an answer key. And a Checker reviews the task too. This one was sent back because it practised the wrong skill, and rebuilt."

## 3:45 – 4:15 · The teacher decides, then it delivers

**Lesedi:** open the **Approval** tab, scroll the brief, click **Approve and send**, then confirm. **Owethu:** hold up the phone as the email arrives. **Lesedi:** in **Outbox**, download the teacher brief and marks workbook.

> "Nothing has been sent yet. The teacher reads a one-page brief: who needs help, why, and what the colleague wasn't sure about. Then approves.
>
> And there it is: feedback and a catch-up task, on the learner's phone. Marks in a spreadsheet, ready for the school's records."

## 4:15 – 5:00 · Close: real numbers, five criteria

**On screen:** the closing slide, filled from `npm run results` (the script prints these lines ready to paste).

> "From one goal: «closing_line»
>
> It **reasons**: «criteria.reasons»
> It **self-corrects**: «criteria.self_corrects»
> It **executes**: «criteria.executes»
> It **collaborates**: «criteria.collaborates»
> And it **serves education**: «criteria.serves_education»
>
> Next: the same engine for candidate attorneys preparing for the LPC exam, where the pass rate in one paper was four percent.
>
> Teachers don't need another chatbot. They need a colleague who checks its own work. Thank you."

---

## Pre-demo checklist

**The night before (Junior)**
- [ ] Demo API keys in `.env`. `npm run ping` returns JSON.
- [ ] `npm run warm` passes (run 2 under 60 s and ≥95% cached). Note the run id it prints.
- [ ] `npm run results` writes `data/demo-results.json` (not a rehearsal). Fill the «» numbers into the closing slide and this script.
- [ ] At least one struggling learner in `data/learners.csv` has a **real team inbox**, so an email can land on Owethu's phone. Re-run `npm run warm` after changing it.
- [ ] Merge everything, tag `v0.9-freeze`, `npm run build`.

**30 minutes before (everyone)**
- [ ] `.env`: `DEMO_PACE_MS=600`, `FAKE_LLM=0`. Then `npm run build && npm start`.
- [ ] Open the app → **Load demo class** once. It must finish at the approval gate in about 30 s with no live calls (server log). Then reload the start screen.
- [ ] **Backup:** **Open last run** works (reopens the warmed run at the approval gate).
- [ ] **Backup video** open in a browser tab (Owethu), muted, at 0:00.
- [ ] Phone hotspot on and the laptop connected (venue Wi-Fi may block SMTP). Team inbox open on Owethu's phone.
- [ ] Laptop at 1280×720, notifications off, the browser zoom at 100%, the terminal hidden.

**If something goes wrong on stage**
| Problem | Do this |
| --- | --- |
| Run stalls or errors | Lesedi clicks **Open last run** (the warmed run, already at the gate). Keep talking: "here's the run we did earlier." |
| Email doesn't arrive | Show the **Outbox** tab: every email with its status. Don't claim it arrived. |
| Laptop or app fails | Owethu plays the backup video. Junior narrates over it. |
| A number on the slide looks wrong | Only say what's in `data/demo-results.json`. Skip the number rather than guess. |

## Rehearsal plan (3 runs, from H21)

1. **Run 1:** full 5 minutes with a timer, Lesedi driving. Note where you run long.
2. **Run 2:** practise the two recoveries: **Open last run** mid-demo, and switching to the backup video.
3. **Run 3:** clean run against the clock. Final cut: if over 5:00, shorten 1:00–1:45 first, never 1:45–3:00.
