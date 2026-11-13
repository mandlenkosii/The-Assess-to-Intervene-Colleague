# Demo assets (Owethu)

Use synthetic or anonymised data only. Do not claim a live run or delivery result until the full pipeline has been integrated and the numbers have been measured.

## Five-minute pitch slide outline

1. **The problem:** teachers need consistent marks and a useful next step for every learner. Keep this to one sentence and one verified statistic from the team's source material.
2. **The workflow:** rubric and scripts flow through Planner, Marker, Calibration Reviewer, Diagnostician, Practice Builder, Practice Checker, teacher approval, and Delivery.
3. **The proof:** show exact evidence quotes and a real reviewer correction from the run log. Add the before/after mark and reviewer reason from the completed demo run.
4. **The intervention:** show one real learner card with the diagnosed gap and the checked practice task. Use a fictional learner and synthetic script.
5. **The outcome:** show the teacher-approved brief, spreadsheet, and outbox. Fill in measured accuracy, caught traps, correction count, and run time only after the final test run.

## Three-minute backup video shot list

Record a single clean cached run at 1280×720. Keep the mouse movements deliberate and leave each important state on screen long enough to read.

| Time | Shot | Capture |
| --- | --- | --- |
| 0:00–0:15 | Open on the class workspace | Show the product title and the one-line teacher goal. |
| 0:15–0:35 | Plan and marking | Show the trace progressing and one mark with its verbatim evidence. |
| 0:35–1:05 | Review and correction | Show a real rejection reason and its before/after correction. Do not stage a false success. |
| 1:05–1:35 | Learner intervention | Open a synthetic learner card; show the root gap, task questions, and answer key. |
| 1:35–1:55 | Teacher approval | Review the brief and needs-teacher items; demonstrate the explicit confirmation step. |
| 1:55–2:25 | Delivery results | Show the outbox and open the generated workbook and brief. Clearly label failures or skipped recipients. |
| 2:25–3:00 | Close | Show measured demo results and the five judging criteria. Use verified figures from `data/demo-results.json` once it exists. |

### Recording checklist

- Run the completed demo three times from cache before recording.
- Confirm the approval step is visible and no email is sent before approval.
- The active 3D scene measured 60.16fps in the browser harness at 1280×720 (5 seconds unthrottled and 8 seconds with 4× CPU throttling), with 16.7ms median and p95 frame times and no frames over 20ms. Repeat this check on the presentation laptop; the harness result is not a physical-hardware measurement.
- Use only team inboxes for any actual test delivery; placeholders in `data/learners.csv` are not deliverable addresses.
- Keep the backup video open before the live pitch and have a phone hotspot available.
