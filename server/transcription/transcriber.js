// Transcriber agent (FEATURE_HANDWRITING only): reads a photo or scan of a handwritten script.
//   1. Two independent readings, each pinned to one model: Gemini, then Groq's vision model (different models rarely
//      invent the same word). If one model fails, the other's reading is used and the script is flagged: that is the fallback.
//   2. Code keeps only the words both readings agree on; every other word becomes [illegible]. Nothing is guessed.
//   3. Self-check: too many [illegible] words, or too much disagreement → "transcription needs teacher",
//      logged at stage "correct". The teacher reviews and edits every transcription before marking starts.
// Never throws: a failed reading is flagged for the teacher instead.
import { readFile } from "node:fs/promises";
import { pdfToText } from "../parse.js";
import { z } from "zod";
import { env } from "../env.js";

export const ILLEGIBLE = "[illegible]";
const Reading = z.object({ text: z.string() });
const WORD = /\[illegible\]|\S+/gi;
const PROMPT = new URL("../prompts/transcriber.md", import.meta.url);

// Comparison form of a word: lower case, outer punctuation dropped. [illegible] never matches anything.
function norm(word) {
  if (word.toLowerCase() === ILLEGIBLE) return null;
  return word.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}
const isWord = (w) => norm(w) !== "";        // punctuation-only tokens (e.g. "-") aren't counted as words
const words = (text) => (String(text).match(WORD) ?? []).filter(isWord);

// Longest common subsequence of two word lists; returns the matched indices in `a`.
function lcsIndices(a, b) {
  if (a.length * b.length > 4_000_000) return new Set(); // far longer than any script: nothing confirmed, teacher checks it
  const na = a.map(norm);
  const nb = b.map(norm);
  const rows = na.length + 1;
  const cols = nb.length + 1;
  const table = new Uint16Array(rows * cols);
  for (let i = na.length - 1; i >= 0; i--) {
    for (let j = nb.length - 1; j >= 0; j--) {
      table[i * cols + j] = na[i] !== null && na[i] === nb[j]
        ? table[(i + 1) * cols + j + 1] + 1
        : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
    }
  }
  const keep = new Set();
  for (let i = 0, j = 0; i < na.length && j < nb.length;) {
    if (na[i] !== null && na[i] === nb[j]) { keep.add(i); i++; j++; }
    else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) i++;
    else j++;
  }
  return keep;
}

/**
 * Merges two readings: the first reading's layout, with every word the second reading doesn't confirm
 * replaced by [illegible].
 */
export function compareReadings(first, second) {
  const a = words(first);
  const b = words(second);
  const keep = lcsIndices(a, b);
  let index = 0;
  const text = String(first).replace(WORD, (token) => (!isWord(token) ? token : keep.has(index++) ? token : ILLEGIBLE));
  const illegible = a.length - keep.size;
  return {
    text,
    illegible_share: a.length ? illegible / a.length : 1,
    disagreement: a.length + b.length ? 1 - (2 * keep.size) / (a.length + b.length) : 0,
    words: a.length,
  };
}

export function illegibleShare(text) {
  const all = words(text);
  return all.length ? all.filter((w) => norm(w) === null).length / all.length : 1;
}

// A PDF that already has a text layer is typed, not handwritten: use its text and skip the model.
async function pdfText(buffer) {
  try {
    const text = await pdfToText(buffer);
    return text.replace(/\s/g, "").length >= 30 ? text.trim() : null;
  } catch {
    return null; // image-only, or a PDF this parser can't open: let the vision model read it
  }
}

/**
 * @param {{ id: string, filename: string, mime: string, buffer: Buffer }} file
 * @param {{ llm: any, emit?: Function, thresholds?: { illegibleMax?: number, disagreeMax?: number } }} ctx
 */
export async function transcribeScript(file, { llm, emit = () => {}, thresholds = {} }) {
  const illegibleMax = thresholds.illegibleMax ?? env.HANDWRITING_ILLEGIBLE_MAX;
  const disagreeMax = thresholds.disagreeMax ?? env.HANDWRITING_DISAGREE_MAX;
  const item = { id: file.id, filename: file.filename, mime: file.mime, status: "ok", text: "", reasons: [], notes: [], illegible_share: 0, disagreement: 0, method: "" };

  if (file.mime === "application/pdf") {
    const typed = await pdfText(file.buffer);
    if (typed) {
      Object.assign(item, { text: typed, method: "pdf-text", notes: ["This PDF has typed text, so it was read directly."] });
      emit({ stage: "act", agent: "transcriber", kind: "log", ref: item.id, message: `${item.id}: typed PDF, text read directly`, data: { method: item.method } });
      return item;
    }
  }

  const prompt = await readFile(PROMPT, "utf8");
  const image = { type: "image_url", image_url: { url: `data:${file.mime};base64,${file.buffer.toString("base64")}` } };
  // Groq's vision model can't open PDFs, so a PDF's second reading is a separate Gemini pass.
  const isPdf = file.mime === "application/pdf";
  const read = (only, label) => llm.json([
    { role: "system", content: prompt },
    { role: "user", content: [{ type: "text", text: label }, image] },
  ], { schema: Reading, tier: "vision", temperature: 0, maxTokens: 4096, only }).then((r) => r.text, (err) => { item.notes.push(`${label} failed: ${err.message}`); return null; });

  const first = await read("gemini", "Transcribe this script.");
  const second = await read(isPdf ? "gemini" : "groq", "Transcribe this script. This is an independent second reading.");
  item.method = isPdf ? "vision-single-model" : "vision-two-model";

  if (first === null && second === null) {
    item.status = "needs_teacher";
    item.reasons.push("The script couldn't be read; type it in or upload a clearer photo");
  } else if (first === null || second === null) {
    item.text = first ?? second;
    item.illegible_share = illegibleShare(item.text);
    item.status = "needs_teacher";
    item.reasons.push("Only one reading succeeded, so no word could be double-checked");
  } else {
    const merged = compareReadings(first, second);
    Object.assign(item, { text: merged.text, illegible_share: merged.illegible_share, disagreement: merged.disagreement });
    if (merged.illegible_share > illegibleMax) item.reasons.push(`${pct(merged.illegible_share)} of the words are illegible (limit ${pct(illegibleMax)})`);
    if (merged.disagreement > disagreeMax) item.reasons.push(`The two readings disagree on ${pct(merged.disagreement)} of the words (limit ${pct(disagreeMax)})`);
    if (item.reasons.length) item.status = "needs_teacher";
  }
  if (isPdf) item.notes.push("Checked by one model only: the second reader can't open PDFs.");

  const data = { method: item.method, illegible_share: item.illegible_share, disagreement: item.disagreement };
  if (item.status === "needs_teacher") {
    emit({
      stage: "correct", agent: "transcriber", kind: "correction", ref: item.id,
      message: `${item.id}: transcription needs teacher (${item.reasons[0]})`,
      data: { ...data, route: "transcriber", status: "needs_teacher", reasons: item.reasons },
    });
  } else {
    emit({
      stage: "act", agent: "transcriber", kind: "log", ref: item.id,
      message: `${item.id}: transcribed, ${pct(item.illegible_share)} illegible, readings ${pct(1 - item.disagreement)} in agreement`,
      data,
    });
  }
  return item;
}

const pct = (n) => `${Math.round(n * 100)}%`;
