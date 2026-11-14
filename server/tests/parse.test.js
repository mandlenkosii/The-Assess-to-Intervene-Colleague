// File parsing: typed PDF and DOCX scripts, directly and through the upload route. Fixtures are synthetic.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pdfToText, toText } from "../parse.js";
import { createApp } from "../app.js";
import { createRunStore } from "../runStore.js";

const fixture = (name) => readFileSync(new URL(`./fixtures/files/${name}`, import.meta.url));
const TYPED_PDF = "Phones should not be banned in schools. This is typed text.";
const TYPED_DOCX = "Phones distract learners in class every day.";

test("parse: a PDF printed from a modern browser is read (old pdf-parse failed with 'bad XRef entry')", async () => {
  assert.equal((await pdfToText(fixture("typed.pdf"))).trim(), TYPED_PDF);
  assert.equal((await toText({ name: "L001.pdf", buffer: fixture("typed.pdf") })).trim(), TYPED_PDF);
});

test("parse: a scanned PDF with no text layer gets a clear error, not an empty script", async () => {
  assert.equal((await pdfToText(fixture("scanned.pdf"))).trim(), "");
  await assert.rejects(toText({ name: "L002.pdf", buffer: fixture("scanned.pdf") }), /no text layer/);
});

test("parse: DOCX text is extracted", async () => {
  const text = await toText({ name: "L003.docx", buffer: fixture("typed.docx") });
  assert.match(text, new RegExp(TYPED_DOCX));
  assert.match(text, /synthetic test essay/);
});

test("parse: PDFs still read when the native canvas package can't load (e.g. a Windows lockfile on Linux)", () => {
  // Child process with @napi-rs/canvas made unresolvable, the way it is when its platform binary is missing.
  const script = `
    const Module = (await import("node:module")).default;
    const resolve = Module._resolveFilename;
    Module._resolveFilename = function (request, ...rest) {
      if (request.startsWith("@napi-rs/canvas")) throw new Error("Cannot find module '" + request + "'");
      return resolve.call(this, request, ...rest);
    };
    const { pdfToText } = await import(${JSON.stringify(new URL("../parse.js", import.meta.url).href)});
    const { readFileSync } = await import("node:fs");
    process.stdout.write((await pdfToText(readFileSync(${JSON.stringify(fileURLToPath(new URL("./fixtures/files/typed.pdf", import.meta.url)))}))).trim());
  `;
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  assert.equal(out, TYPED_PDF);
});

test("upload: PDF and DOCX class scripts reach the run (multer's originalname was never passed to the parser)", async () => {
  const store = createRunStore({ persist: false });
  const noLLM = { json: async () => { throw new Error("model should not be called"); }, stats: {} };
  const { app } = createApp({ store, llm: noLLM, agents: { markScript: null } });
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const rubric = { pass_mark: 50, criteria: [{ name: "argument", max_score: 20 }] };
  const post = (scripts) => {
    const form = new FormData();
    form.append("rubric", new Blob([JSON.stringify(rubric)]), "rubric.json");
    form.append("learners", new Blob(["learner_id,name,grade,email\nL001,A,10,a\nL002,B,10,b\nL003,C,10,c\n"]), "learners.csv");
    for (const [buffer, name] of scripts) form.append("scripts", new Blob([buffer]), name);
    return fetch(`${base}/api/runs`, { method: "POST", body: form });
  };
  try {
    const ok = await post([[fixture("typed.pdf"), "L001.pdf"], [fixture("typed.docx"), "L002.docx"], ["A typed essay.", "L003.txt"]]);
    assert.equal(ok.status, 201, await ok.clone().text());
    const run = store.get((await ok.json()).runId);
    assert.equal(run.scripts.L001.trim(), TYPED_PDF);
    assert.match(run.scripts.L002, new RegExp(TYPED_DOCX));
    assert.equal(run.scripts.L003, "A typed essay.");

    const scanned = await post([[fixture("scanned.pdf"), "L001.pdf"]]);
    assert.equal(scanned.status, 400);
    assert.match((await scanned.json()).error, /L001\.pdf: couldn't read this file \(.*no text layer/);
  } finally { server.closeAllConnections?.(); server.close(); }
});
