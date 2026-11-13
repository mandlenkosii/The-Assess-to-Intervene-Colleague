// Builds run inputs from the demo class in data/ or from uploaded files.
// Convention: everything in a run is keyed by learner_id (script_id === learner_id).
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "./env.js";

const DATA = join(ROOT, "data");
export const DEFAULT_GOAL =
  "Mark this class set against the rubric, check the marks, and prepare catch-up plans for anyone who is struggling.";

export class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

// Minimal CSV reader for learners.csv (header row, optional double quotes, no embedded newlines).
export function parseCsv(text) {
  const rows = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const split = (line) => [...line.matchAll(/("([^"]*(?:""[^"]*)*)"|[^,]*)(,|$)/g)]
    .slice(0, -1).map((m) => (m[2] !== undefined ? m[2].replace(/""/g, '"') : m[1]).trim());
  const [header, ...body] = rows.map(split);
  return body.map((cells) => Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""])));
}

export function learnersFromCsv(text) {
  return Object.fromEntries(parseCsv(text).map((r) => [r.learner_id, {
    learner_id: r.learner_id, name: r.name, grade: Number(r.grade) || null, email: r.email,
  }]));
}

// Pairs scripts with learners in order when their ids differ (demo scripts are "script_01"…; learners are "L001"…).
export function keyByLearner(scriptList, learners) {
  const learnerIds = Object.keys(learners);
  const scripts = {};
  const source_ids = {};
  scriptList.forEach(({ id, text }, i) => {
    const learnerId = learners[id] ? id : learnerIds[i] ?? id;
    scripts[learnerId] = text;
    source_ids[learnerId] = id;
  });
  return { scripts, source_ids };
}

async function readAnchors(dir, rubric) {
  const meta = JSON.parse(await readFile(join(dir, "anchors.json"), "utf8"));
  const anchors = {};
  for (const [key, a] of Object.entries(meta)) {
    const text = await readFile(join(dir, a.file), "utf8");
    anchors[key] = { script_id: a.script_id ?? key, text, scores: a.scores, total_pct: a.total_pct ?? pct(a.scores, rubric) };
  }
  return anchors;
}

const pct = (scores = [], rubric) => {
  const max = scores.reduce((s, x) => s + (x.max_score ?? 0), 0) || 1;
  return Math.round((scores.reduce((s, x) => s + x.score, 0) / max) * 1000) / 10;
};

async function readScriptList() {
  const js = join(DATA, "scripts.js");
  if (existsSync(js)) {
    const { demoScripts } = await import(pathToFileURL(js).href);
    return demoScripts.map((s) => ({ id: s.script_id, text: s.text }));
  }
  const dir = join(DATA, "scripts");
  if (existsSync(dir)) {
    const files = (await readdir(dir)).filter((f) => extname(f) === ".txt").sort();
    return Promise.all(files.map(async (f) => ({ id: f.replace(/\.txt$/, ""), text: await readFile(join(dir, f), "utf8") })));
  }
  return [];
}

export async function loadDemoInputs(goal = DEFAULT_GOAL) {
  const need = ["rubric.json", "anchors/anchors.json", "learners.csv"].filter((f) => !existsSync(join(DATA, f)));
  if (need.length) throw new InputError(`Demo class data isn't in data/ yet (missing ${need.join(", ")})`, 503);
  const rubric = JSON.parse(await readFile(join(DATA, "rubric.json"), "utf8"));
  const learners = learnersFromCsv(await readFile(join(DATA, "learners.csv"), "utf8"));
  const list = await readScriptList();
  if (!list.length) throw new InputError("The built-in class set has no scripts (data/scripts.js or data/scripts/*.txt)", 503);
  const anchors = await readAnchors(join(DATA, "anchors"), rubric);
  return { goal, rubric, anchors, learners, ...keyByLearner(list, learners) };
}

// Uploaded files (multer memory storage). Typed text only in phase 1; PDF/DOCX go through parse.js once it lands.
export async function uploadInputs({ goal, files }) {
  const byField = (name) => files.filter((f) => f.fieldname === name);
  const one = (name) => byField(name)[0];
  const toText = await textReader();

  if (!one("rubric")) throw new InputError("A rubric file is required");
  if (!byField("scripts").length) throw new InputError("At least one script is required");
  if (!one("learners")) throw new InputError("learners.csv is required");

  let rubric;
  const rubricText = await toText(one("rubric"));
  try { rubric = JSON.parse(rubricText); } catch { rubric = rubricText; } // free-form rubric → Planner reads it with the model

  const learners = learnersFromCsv(await toText(one("learners")));
  const list = await Promise.all(byField("scripts").map(async (f) => ({ id: stem(f.originalname), text: await toText(f) })));

  const anchors = {};
  const anchorMarks = one("anchorMarks") ? JSON.parse(await toText(one("anchorMarks"))) : {};
  for (const f of byField("anchors")) {
    const key = stem(f.originalname);
    const m = anchorMarks[key] ?? anchorMarks[f.originalname] ?? {};
    anchors[key] = { script_id: key, text: await toText(f), scores: m.scores ?? [], total_pct: m.total_pct ?? null };
  }

  return { goal: goal?.trim() || DEFAULT_GOAL, rubric, anchors, learners, ...keyByLearner(list, learners) };
}

const stem = (name) => name.replace(/\.[^.]+$/, "");

async function textReader() {
  const parsePath = new URL("./parse.js", import.meta.url);
  const parse = existsSync(parsePath) ? await import(parsePath.href) : null;
  return async (file) => {
    const ext = extname(file.originalname).toLowerCase();
    if ([".txt", ".md", ".json", ".csv", ""].includes(ext)) return file.buffer.toString("utf8");
    if (parse?.toText) return parse.toText(file);
    throw new InputError(`${file.originalname}: only .txt/.json/.csv are supported until parse.js lands`);
  };
}
