// Transcription jobs (FEATURE_HANDWRITING only). A job lives in memory until the teacher starts marking:
// images are never written to disk, and jobs expire after two hours.
import { randomBytes } from "node:crypto";
import pLimit from "p-limit";
import { makeEvent } from "@colleague/shared";
import { env } from "../env.js";
import { transcribeScript } from "./transcriber.js";

const TTL_MS = 2 * 60 * 60 * 1000;

export function createTranscriptionStore({ now = () => Date.now() } = {}) {
  const jobs = new Map();

  function sweep() {
    for (const [id, job] of jobs) if (now() - job.started > TTL_MS) jobs.delete(id);
  }

  /**
   * Starts transcribing in the background and returns the job at once; poll get(id) for progress.
   * @param {Array<{ id: string, filename: string, mime: string, buffer: Buffer }>} files
   */
  function start(files, { llm, concurrency = env.CONCURRENCY, thresholds } = {}) {
    sweep();
    const id = `tx_${Date.now().toString(36)}_${randomBytes(2).toString("hex")}`;
    const job = { id, status: "transcribing", started: now(), total: files.length, items: [], log: [] };
    jobs.set(id, job);
    const emit = (e) => job.log.push(makeEvent(e.stage, e.agent, e.kind, e.message, { ref: e.ref, data: e.data }));
    const limit = pLimit(Math.max(1, concurrency));

    job.done = Promise.all(files.map((file) => limit(async () => {
      const item = await transcribeScript(file, { llm, emit, thresholds });
      job.items.push(item);
    }))).then(() => {
      job.items.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
      job.status = "done";
    }, (err) => {
      // transcribeScript never throws, so this is a bug: surface it instead of hanging the review screen.
      console.error(`[transcription] ${id} failed:`, err);
      job.status = "error";
      job.error = err.message;
    });
    return job;
  }

  const get = (id) => { sweep(); return jobs.get(id) ?? null; };

  // What the review screen needs (no image data: the browser already has the photos).
  function view(id) {
    const job = get(id);
    if (!job) return null;
    const { done, ...rest } = job;
    return { ...rest, completed: job.items.length };
  }

  return { start, get, view };
}
