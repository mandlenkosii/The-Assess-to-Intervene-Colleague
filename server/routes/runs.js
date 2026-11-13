// Run lifecycle API.
//   POST /api/runs          multipart: goal, rubric, anchors[], anchorMarks, scripts[], learners → { runId }
//   POST /api/runs/demo     { goal? } → { runId } (loads the demo class from data/)
//   GET  /api/runs/latest   → snapshot of the most recent run
//   GET  /api/runs/:id      → snapshot (no script texts)
//   GET  /api/runs/:id/events  SSE: replays the log, then streams live events
//   GET  /api/runs/:id/brief → generated brief.md
//   GET  /api/runs/:id/marks.xlsx → generated workbook
//   POST /api/runs/:id/approve  { approved: true, excluded?: [learnerIds] } → 202, starts delivery
import express from "express";
import { access } from "node:fs/promises";
import multer from "multer";
import { join } from "node:path";
import { InputError, loadDemoInputs, uploadInputs } from "../inputs.js";
import { approveRun, runColleague } from "../orchestrator.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 80 } });

export function runsRouter({ store, llm, agents }) {
  const router = express.Router();

  const start = (input) => {
    const run = store.create(input);
    // Fire and forget: the client follows progress over SSE.
    runColleague(run.id, { store, llm, agents });
    return run.id;
  };

  router.post("/runs/demo", async (req, res, next) => {
    try {
      res.status(201).json({ runId: start(await loadDemoInputs(req.body?.goal || undefined)) });
    } catch (err) { next(err); }
  });

  router.post("/runs", upload.any(), async (req, res, next) => {
    try {
      res.status(201).json({ runId: start(await uploadInputs({ goal: req.body?.goal, files: req.files ?? [] })) });
    } catch (err) { next(err); }
  });

  // The human gate: nothing is sent before this.
  router.post("/runs/:id/approve", (req, res, next) => {
    try {
      if (req.body?.approved === false) return res.status(400).json({ error: "Send { approved: true } to approve" });
      const excluded = Array.isArray(req.body?.excluded) ? req.body.excluded.map(String) : [];
      const { run } = approveRun(req.params.id, { excluded }, { store, llm, agents });
      res.status(202).json({ runId: run.id, status: run.status, excluded: run.excluded });
    } catch (err) { next(err); }
  });

  router.get("/runs/latest", (_req, res) => {
    const run = store.latest();
    run ? res.json(store.snapshot(run.id)) : res.status(404).json({ error: "No runs yet" });
  });

  router.get("/runs/:id", (req, res) => {
    const snap = store.snapshot(req.params.id);
    snap ? res.json(snap) : res.status(404).json({ error: "Run not found" });
  });

  router.get("/runs/:id/brief", (req, res, next) => {
    downloadRunArtifact(req, res, next, store, "brief.md");
  });

  router.get("/runs/:id/marks.xlsx", (req, res, next) => {
    downloadRunArtifact(req, res, next, store, "marks.xlsx");
  });

  router.get("/runs/:id/events", (req, res) => {
    const run = store.get(req.params.id);
    if (!run) return res.status(404).json({ error: "Run not found" });

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders?.();

    // Resume support: EventSource sends Last-Event-ID on reconnect, so only missing events are replayed.
    let next = Number(req.get("Last-Event-ID") ?? -1) + 1;
    const send = (ev) => { res.write(`id: ${next++}\ndata: ${JSON.stringify(ev)}\n\n`); };
    run.log.slice(next).forEach((ev) => send(ev));

    const unsubscribe = store.subscribe(run.id, send);
    const heartbeat = setInterval(() => res.write(": ping\n\n"), 15000);
    req.on("close", () => { clearInterval(heartbeat); unsubscribe(); });
  });

  // Errors → JSON with a human message.
  router.use((err, _req, res, _next) => {
    const status = err instanceof InputError ? err.status : err?.status ?? 500;
    if (status >= 500 && !(err instanceof InputError)) console.error(err);
    res.status(status).json({ error: err.message ?? "Something went wrong" });
  });

  return router;
}

async function downloadRunArtifact(req, res, next, store, filename) {
  try {
    const run = store.get(req.params.id);
    if (!run) return res.status(404).json({ error: "Run not found" });

    const directory = store.runDir?.(run.id);
    if (!directory) return res.status(404).json({ error: `${filename} is not available yet` });

    const filePath = join(directory, filename);
    await access(filePath);
    res.download(filePath, filename, (error) => {
      if (error) next(error);
    });
  } catch (error) {
    if (error.code === "ENOENT") return res.status(404).json({ error: `${filename} is not available yet` });
    next(error);
  }
}
