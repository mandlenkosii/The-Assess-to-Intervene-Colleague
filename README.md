# Assess-to-Intervene Colleague — marking slice

This branch implements Lesedi's marking and self-correction foundation from the latest Node/React game plan: the Grade 10 rubric, teacher-marked anchors, synthetic demo class, text/PDF/DOCX parsing, learner CSV validation, Marker, mark checks, and their tests. It deliberately does not implement orchestration, delivery, or the other roles' UI.

The original dataset counts list 22 ordinary scripts plus seven traps, which totals 29 despite requiring 30 learners/scripts. This demo uses 23 ordinary scripts and the same seven trap types to meet the 30-script target.

## Development

Requires Node.js 20 or newer.

```sh
npm install
npm test
```

Demo data is synthetic. The learner CSV uses reserved `.test` addresses and must never be treated as real delivery contacts.
