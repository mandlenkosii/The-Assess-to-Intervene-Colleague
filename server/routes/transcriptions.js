// Handwritten script photos (FEATURE_HANDWRITING). With the flag off these routes answer 404, and
// /api/features tells the UI to keep showing today's screens.
//   GET  /api/features             → { handwriting: boolean }
//   POST /api/transcriptions       multipart: photos[] (.jpg/.jpeg/.png/.pdf) → 202 { id }
//   GET  /api/transcriptions/:id   → { status, total, completed, items: [{ id, text, status, reasons, … }], log }
import express from "express";
import multer from "multer";
import { env } from "../env.js";
import { createTranscriptionStore } from "../transcription/session.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 80 } });

// Trust the file's bytes, not its name.
export function sniffMime(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  return null;
}

const stem = (name) => name.replace(/\.[^.]+$/, "");

export function transcriptionsRouter({ llm, transcriptions = createTranscriptionStore(), thresholds } = {}) {
  const router = express.Router();
  const enabled = (_req, res, next) => (env.FEATURE_HANDWRITING ? next() : res.status(404).json({ error: "Not found" }));

  router.get("/features", (_req, res) => res.json({ handwriting: env.FEATURE_HANDWRITING }));

  router.post("/transcriptions", enabled, upload.array("photos"), (req, res) => {
    const files = req.files ?? [];
    if (!files.length) return res.status(400).json({ error: "Add at least one photo or scan" });
    const prepared = [];
    for (const f of files) {
      const mime = sniffMime(f.buffer);
      if (!mime) return res.status(400).json({ error: `${f.originalname}: use a JPG, PNG or PDF` });
      prepared.push({ id: stem(f.originalname), filename: f.originalname, mime, buffer: f.buffer });
    }
    const ids = prepared.map((p) => p.id);
    const dupe = ids.find((id, i) => ids.indexOf(id) !== i);
    if (dupe) return res.status(400).json({ error: `Two files are named "${dupe}"; use one file per learner` });
    const job = transcriptions.start(prepared, { llm, thresholds });
    res.status(202).json({ id: job.id, total: job.total });
  });

  router.get("/transcriptions/:id", enabled, (req, res) => {
    const view = transcriptions.view(req.params.id);
    view ? res.json(view) : res.status(404).json({ error: "Transcription not found or expired" });
  });

  router.use((err, _req, res, _next) => {
    const status = err instanceof multer.MulterError ? 400 : err?.status ?? 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: err.message ?? "Something went wrong" });
  });

  return router;
}
