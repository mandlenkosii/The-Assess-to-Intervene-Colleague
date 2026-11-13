# Assess-to-Intervene Colleague — marking slice

The Lesedi feature branches implement the marking and self-correction scope from the latest Node/React game plan: the Grade 10 rubric, teacher-marked anchors, synthetic demo class, text/PDF/DOCX parsing, learner CSV validation, Marker, code-first calibration checks, evidence cards, a six-stage trace, correction log and their tests. They deliberately do not implement orchestration, delivery, or the rest of the app.

The original dataset counts list 22 ordinary scripts plus seven traps, which totals 29 despite requiring 30 learners/scripts. This demo uses 23 ordinary scripts and the same seven trap types to meet the 30-script target.

## Development

Requires Node.js 20 or newer.

```sh
npm install
npm test
npm run build:ui
```

Demo data is synthetic. The learner CSV uses reserved `.test` addresses and must never be treated as real delivery contacts.
