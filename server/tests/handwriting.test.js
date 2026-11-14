// Handwritten script photos (FEATURE_HANDWRITING). No network: both vision providers are stubs that answer
// per fixture image, run through the real llm client (cache, prefer, fallback). The fixtures are synthetic.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LogEvent } from "@colleague/shared";
import { env } from "../env.js";
import { createApp } from "../app.js";
import { createLLM } from "../llm.js";
import { createRunStore } from "../runStore.js";
import { createFakeLLM } from "../scripts/fakeLLM.js";
import { ILLEGIBLE_NOTE, markScript } from "../agents/marker.js";
import { compareReadings } from "../transcription/transcriber.js";
import { goldenRun } from "./helpers/goldenRun.js";

const CLEAN_TEXT = "Phones should not be banned in schools.\nFirst, they help learners research quickly.\nSecond, parents can reach their children.\nIn conclusion, teach good habits instead.";
// What Gemini really returned for the blurry sample in a live probe: some [illegible], plus confident inventions.
const BLURRY_GUESS = "Modern broadcast art format is critical. First, it is [illegible] [illegible] connected rapidly. Second, [illegible] [illegible] [illegible] [illegible]. In sometimes, [illegible] [illegible] control";

const fixture = (name) => readFileSync(new URL(`./fixtures/handwriting/${name}`, import.meta.url));
const b64 = Object.fromEntries(["clean.png", "blurry.png", "scan.pdf"].map((f) => [f, fixture(f).toString("base64")]));
const rubric = JSON.parse(readFileSync(new URL("../../data/rubric.json", import.meta.url), "utf8"));

// answers[fixture][provider] = transcription text, or an Error to throw.
function visionLLM(answers, calls = []) {
  const provider = (name) => async (body) => {
    const parts = body.messages.flatMap((m) => (Array.isArray(m.content) ? m.content : []));
    const url = parts.find((p) => p.type === "image_url")?.image_url.url ?? "";
    const file = Object.keys(b64).find((f) => url.endsWith(b64[f]));
    calls.push({ provider: name, model: body.model, file, mime: url.slice(5, url.indexOf(";")) });
    const answer = answers[file]?.[name];
    if (answer instanceof Error || answer === undefined) throw Object.assign(answer ?? new Error("no stub answer"), { status: 400 });
    return JSON.stringify({ text: answer });
  };
  return createLLM({ transport: { gemini: provider("gemini"), groq: provider("groq") }, cacheDir: mkdtempSync(join(tmpdir(), "hw-cache-")), retryBaseMs: 1, primary: "gemini" });
}

async function withFlag(on, fn) {
  const before = env.FEATURE_HANDWRITING;
  env.FEATURE_HANDWRITING = on;
  try { return await fn(); } finally { env.FEATURE_HANDWRITING = before; }
}

async function withServer({ answers = {}, calls } = {}, fn) {
  const store = createRunStore({ persist: false });
  const { app } = createApp({
    store, llm: createFakeLLM(), visionLLM: visionLLM(answers, calls),
    agents: { sendAll: async () => [], marksXlsx: null },
  });
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  try { await fn(`http://127.0.0.1:${server.address().port}`, store); } finally { server.closeAllConnections?.(); server.close(); }
}

async function transcribe(base, files) {
  const form = new FormData();
  for (const [file, as] of files) form.append("photos", new Blob([fixture(file)]), as);
  const res = await fetch(`${base}/api/transcriptions`, { method: "POST", body: form });
  assert.equal(res.status, 202, await res.clone().text());
  const { id } = await res.json();
  for (let i = 0; i < 200; i++) {
    const job = await (await fetch(`${base}/api/transcriptions/${id}`)).json();
    if (job.status !== "transcribing") return job;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("transcription did not finish");
}

async function startRun(base, { scripts, transcriptionId }) {
  const form = new FormData();
  form.append("goal", "Mark this class set");
  form.append("rubric", new Blob([JSON.stringify(rubric)]), "rubric.json");
  form.append("learners", new Blob([`learner_id,name,grade,email\n${Object.keys(scripts).map((id) => `${id},Synthetic ${id},10,TEAM_INBOX_1`).join("\n")}\n`]), "learners.csv");
  for (const [id, text] of Object.entries(scripts)) form.append("scripts", new Blob([text]), `${id}.txt`);
  if (transcriptionId) form.append("transcriptionId", transcriptionId);
  const res = await fetch(`${base}/api/runs`, { method: "POST", body: form });
  assert.equal(res.status, 201, await res.clone().text());
  const { runId } = await res.json();
  for (let i = 0; i < 500; i++) {
    const run = await (await fetch(`${base}/api/runs/${runId}`)).json();
    if (["awaiting_approval", "done", "error"].includes(run.status)) return run;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("run did not reach the teacher");
}

const runEvents = (store, id) => store.get(id).log;

// ---------- consensus merge ----------

test("handwriting: only words both readings agree on survive; the rest become [illegible]", () => {
  const same = compareReadings(CLEAN_TEXT, CLEAN_TEXT);
  assert.equal(same.text, CLEAN_TEXT, "layout and punctuation kept");
  assert.equal(same.illegible_share, 0);
  assert.equal(same.disagreement, 0);

  const merged = compareReadings("The learners Research quickly, they say.", "the learners research slowly they say");
  assert.equal(merged.text, "The learners Research [illegible] they say.", "case and outer punctuation ignored; the disputed word is not guessed");
  assert.equal(merged.illegible_share, 1 / 6);

  const blurry = compareReadings(BLURRY_GUESS, "[illegible]");
  assert.doesNotMatch(blurry.text, /broadcast|Modern|connected|control/, "invented words never survive");
  assert.equal(blurry.illegible_share, 1);
  assert.equal(blurry.disagreement, 1);
});

// ---------- flag ON: clean, blurry, PDF, failures ----------

test("handwriting: a clean sample is read by two models, agrees, and marks end to end", async () => {
  await withFlag(true, async () => {
    const calls = [];
    await withServer({ answers: { "clean.png": { gemini: CLEAN_TEXT, groq: CLEAN_TEXT } }, calls }, async (base, store) => {
      const job = await transcribe(base, [["clean.png", "L001.png"]]);
      assert.equal(job.status, "done");
      const [item] = job.items;
      assert.equal(item.id, "L001");
      assert.equal(item.status, "ok");
      assert.equal(item.text, CLEAN_TEXT);
      assert.equal(item.method, "vision-two-model");
      assert.deepEqual(calls.map((c) => [c.provider, c.model, c.mime]), [
        ["gemini", env.GEMINI_VISION_MODEL, "image/png"],
        ["groq", env.GROQ_VISION_MODEL, "image/png"],
      ], "first reading Gemini, independent second reading Groq");

      const run = await startRun(base, { scripts: { L001: item.text }, transcriptionId: job.id });
      assert.equal(run.status, "awaiting_approval");
      assert.ok(run.marks.L001, "the transcribed script was marked");
      const log = runEvents(store, run.id);
      assert.equal(log[0].agent, "transcriber", "the transcription opens the run's log");
      assert.equal(log[0].ref, "L001");
      for (const e of log) assert.ok(LogEvent.safeParse(e).success, `invalid event: ${JSON.stringify(e).slice(0, 160)}`);
    });
  });
});

test("handwriting: a blurry sample is flagged for the teacher, not guessed, and logged at stage correct", async () => {
  await withFlag(true, async () => {
    await withServer({ answers: { "blurry.png": { gemini: BLURRY_GUESS, groq: "[illegible]" } } }, async (base, store) => {
      const job = await transcribe(base, [["blurry.png", "L002.png"]]);
      const [item] = job.items;
      assert.equal(item.status, "needs_teacher");
      assert.doesNotMatch(item.text, /broadcast|Modern|connected|control/);
      assert.ok(item.illegible_share > env.HANDWRITING_ILLEGIBLE_MAX);
      assert.ok(item.reasons.some((r) => /illegible/.test(r)) && item.reasons.some((r) => /disagree/.test(r)));

      const flag = job.log.find((e) => e.kind === "correction");
      assert.equal(flag.stage, "correct");
      assert.equal(flag.agent, "transcriber");
      assert.equal(flag.data.status, "needs_teacher");
      assert.ok(LogEvent.safeParse(flag).success);

      // The flag travels into the run, where the correction log shows it.
      const run = await startRun(base, { scripts: { L002: "The teacher typed this script in after checking the photo." }, transcriptionId: job.id });
      assert.ok(runEvents(store, run.id).some((e) => e.kind === "correction" && e.agent === "transcriber" && e.ref === "L002"));
    });
  });
});

test("handwriting: an image-only PDF is read by Gemini twice and labelled single-model", async () => {
  await withFlag(true, async () => {
    const calls = [];
    await withServer({ answers: { "scan.pdf": { gemini: CLEAN_TEXT } }, calls }, async (base) => {
      const [item] = (await transcribe(base, [["scan.pdf", "L003.pdf"]])).items;
      assert.equal(item.status, "ok");
      assert.equal(item.method, "vision-single-model");
      assert.equal(item.text, CLEAN_TEXT);
      assert.ok(item.notes.some((n) => /one model/.test(n)));
      assert.deepEqual(calls.map((c) => [c.provider, c.mime]), [["gemini", "application/pdf"], ["gemini", "application/pdf"]]);
    });
  });
});

test("handwriting: a typed PDF in the photo upload is read directly, with no model calls", async () => {
  await withFlag(true, async () => {
    const calls = [];
    await withServer({ calls }, async (base) => {
      const form = new FormData();
      form.append("photos", new Blob([readFileSync(new URL("./fixtures/files/typed.pdf", import.meta.url))]), "L006.pdf");
      const res = await fetch(`${base}/api/transcriptions`, { method: "POST", body: form });
      const { id } = await res.json();
      let job;
      for (let i = 0; i < 200 && job?.status !== "done"; i++) {
        job = await (await fetch(`${base}/api/transcriptions/${id}`)).json();
        if (job.status !== "done") await new Promise((r) => setTimeout(r, 10));
      }
      assert.equal(job.items[0].method, "pdf-text");
      assert.equal(job.items[0].status, "ok");
      assert.match(job.items[0].text, /This is typed text/);
      assert.equal(calls.length, 0);
    });
  });
});

test("handwriting: if the models fail, the script is flagged for the teacher and the job still finishes", async () => {
  await withFlag(true, async () => {
    await withServer({ answers: { "clean.png": { gemini: new Error("vision down"), groq: new Error("vision down") } } }, async (base) => {
      const job = await transcribe(base, [["clean.png", "L004.png"]]);
      assert.equal(job.status, "done");
      assert.equal(job.items[0].status, "needs_teacher");
      assert.equal(job.items[0].text, "");
      assert.ok(job.log.some((e) => e.stage === "correct" && e.agent === "transcriber"));
    });
    await withServer({ answers: { "clean.png": { gemini: CLEAN_TEXT, groq: new Error("vision down") } } }, async (base) => {
      const [item] = (await transcribe(base, [["clean.png", "L005.png"]])).items;
      assert.equal(item.status, "needs_teacher", "one reading can't double-check anything");
      assert.match(item.reasons[0], /Only one reading/);
    });
  });
});

test("handwriting: uploads are checked by their bytes, and file names must be unique", async () => {
  await withFlag(true, async () => {
    await withServer({}, async (base) => {
      const post = async (parts) => {
        const form = new FormData();
        for (const [bytes, name] of parts) form.append("photos", new Blob([bytes]), name);
        return fetch(`${base}/api/transcriptions`, { method: "POST", body: form });
      };
      assert.equal((await post([["just text", "L1.png"]])).status, 400, "a .png that isn't a PNG");
      assert.equal((await post([[fixture("clean.png"), "L1.png"], [fixture("clean.png"), "L1.jpg"]])).status, 400, "duplicate learner id");
      assert.equal((await fetch(`${base}/api/transcriptions`, { method: "POST" })).status, 400, "no files");
      assert.equal((await fetch(`${base}/api/transcriptions/tx_missing`)).status, 404);
    });
  });
});

// ---------- the Marker ----------

test("marker: [illegible] gets the 'missing, not wrong' instruction only with the flag on", async () => {
  const prompts = [];
  const llm = {
    json: async (messages) => {
      prompts.push(messages[0].content);
      return {
        script_id: "L001",
        scores: rubric.criteria.map((c) => ({ criterion: c.name, score: 10, max_score: c.max_score, evidence: "Phones", reason: "ok" })),
        feedback: Array.from({ length: 90 }, () => "word").join(" "),
      };
    },
  };
  const mark = (text) => markScript({ scriptId: "L001", text, rubric, anchors: [] }, { llm });
  const typed = "Phones should not be banned in schools.";
  const handwritten = "Phones should not be [illegible] in schools.";

  await withFlag(false, async () => { await mark(typed); await mark(handwritten); });
  await withFlag(true, async () => { await mark(typed); await mark(handwritten); });
  const [offTyped, offHandwritten, onTyped, onHandwritten] = prompts;
  assert.equal(offHandwritten, offTyped, "flag off: no change, even with [illegible]");
  assert.equal(onTyped, offTyped, "flag on: typed scripts get today's prompt");
  assert.equal(onHandwritten, `${offTyped} ${ILLEGIBLE_NOTE}`);
  assert.match(ILLEGIBLE_NOTE, /missing/);
  assert.match(ILLEGIBLE_NOTE, /never as a mistake/);
  assert.match(ILLEGIBLE_NOTE, /feedback/);
});

// ---------- typed files unchanged, flag on or off ----------

test("handwriting flag on: a typed run of the built-in class is identical to main's output", async () => {
  const golden = JSON.parse(readFileSync(new URL("./golden/run-output.json", import.meta.url), "utf8"));
  await withFlag(true, async () => assert.deepEqual(await goldenRun(), golden));
});

test("handwriting flag on or off: a typed upload run is the same, with no transcriber events", async () => {
  const typedRun = (on) => withFlag(on, () => new Promise((resolve, reject) => {
    withServer({}, async (base, store) => {
      const run = await startRun(base, { scripts: { L001: "Phones help learners research quickly and safely.", L002: "Phones distract learners in class every day." } });
      const { id, created_at, ...rest } = run;
      resolve({ run: JSON.parse(JSON.stringify(rest, (k, v) => (k === "t" || k === "llm_stats" ? undefined : v))), log: runEvents(store, id) });
    }).catch(reject);
  }));
  const off = await typedRun(false);
  const on = await typedRun(true);
  assert.deepEqual(on.run, off.run);
  assert.ok(!on.log.some((e) => e.agent === "transcriber"));
});

test("handwriting flag off: transcription routes are hidden and a transcriptionId is ignored", async () => {
  await withFlag(false, async () => {
    await withServer({}, async (base, store) => {
      assert.deepEqual(await (await fetch(`${base}/api/features`)).json(), { handwriting: false });
      const form = new FormData();
      form.append("photos", new Blob([fixture("clean.png")]), "L001.png");
      assert.equal((await fetch(`${base}/api/transcriptions`, { method: "POST", body: form })).status, 404);
      assert.equal((await fetch(`${base}/api/transcriptions/anything`)).status, 404);
      const run = await startRun(base, { scripts: { L001: "Phones help learners." }, transcriptionId: "tx_anything" });
      assert.ok(!runEvents(store, run.id).some((e) => e.agent === "transcriber"));
    });
  });
  await withFlag(true, async () => {
    await withServer({}, async (base) => assert.deepEqual(await (await fetch(`${base}/api/features`)).json(), { handwriting: true }));
  });
});

// ---------- llm client ----------

test("llm: only pins a call to one provider with no fallback; the vision tier uses the vision models", async () => {
  const order = [];
  const send = (name) => async (body) => { order.push(`${name}:${body.model}`); return JSON.stringify({ text: "ok" }); };
  const llm = createLLM({ transport: { gemini: send("gemini"), groq: send("groq") }, cacheDir: mkdtempSync(join(tmpdir(), "hw-llm-")), primary: "gemini" });
  const { z } = await import("zod");
  const schema = z.object({ text: z.string() });
  await llm.json([{ role: "user", content: "a" }], { schema, tier: "vision", only: "groq" });
  await llm.json([{ role: "user", content: "b" }], { schema, tier: "vision" });
  await llm.json([{ role: "user", content: "c" }], { schema });
  assert.deepEqual(order, [`groq:${env.GROQ_VISION_MODEL}`, `gemini:${env.GEMINI_VISION_MODEL}`, `gemini:${env.GEMINI_MODEL}`]);

  // A pinned call that fails is NOT answered by the other provider (that would fake the second opinion).
  const calls = [];
  const down = async () => { calls.push("groq"); throw Object.assign(new Error("down"), { status: 400 }); };
  const up = async () => { calls.push("gemini"); return JSON.stringify({ text: "ok" }); };
  const pinned = createLLM({ transport: { gemini: up, groq: down }, cacheDir: mkdtempSync(join(tmpdir(), "hw-llm-")), primary: "gemini" });
  await assert.rejects(pinned.json([{ role: "user", content: "d" }], { schema, tier: "vision", only: "groq" }), /down/);
  assert.deepEqual(calls, ["groq"]);
});
