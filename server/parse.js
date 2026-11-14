import { parse as parseCsv } from "csv-parse/sync";
import { createRequire } from "node:module";
import mammoth from "mammoth";

// pdf.js is loaded on first use, so a problem with it can only fail a PDF, never the server's startup.
// It needs @napi-rs/canvas (a native binary) for drawing; a lockfile made on Windows can leave the Linux binary
// out, and pdf.js then crashes on import. Text extraction never draws, so stand-ins for the drawing classes are enough.
let pdfjs = null;
function loadPdfjs() {
  pdfjs ??= (async () => {
    try {
      createRequire(import.meta.url)("@napi-rs/canvas");
    } catch {
      globalThis.DOMMatrix ??= class DOMMatrix { constructor() { Object.assign(this, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }); } };
      globalThis.ImageData ??= class ImageData {};
      globalThis.Path2D ??= class Path2D {};
    }
    return import("pdfjs-dist/legacy/build/pdf.mjs");
  })().catch((err) => { pdfjs = null; throw err; });
  return pdfjs;
}

/** Text layer of a PDF, page by page. Image-only (scanned) PDFs give "". */
export async function pdfToText(buffer) {
  const { getDocument } = await loadPdfjs();
  const doc = await getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, disableFontFace: true, verbosity: 0 }).promise;
  try {
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const { items } = await (await doc.getPage(n)).getTextContent();
      pages.push(items.map((item) => (item.str ?? "") + (item.hasEOL ? "\n" : "")).join(""));
    }
    return pages.join("\n\n");
  } finally {
    await doc.destroy();
  }
}

export function normalizeWhitespace(value) {
  return value.replace(/\s+/gu, " ").trim();
}

function getExtension(filename) {
  const index = filename.lastIndexOf(".");
  return index < 0 ? "" : filename.slice(index).toLowerCase();
}

export async function toText(file) {
  if (!file || typeof file.name !== "string" || !Buffer.isBuffer(file.buffer)) {
    throw new TypeError("Expected a file with a name and Buffer content");
  }

  const extension = getExtension(file.name);
  if (extension === ".txt") {
    return file.buffer.toString("utf8");
  }
  if (extension === ".pdf") {
    const text = await pdfToText(file.buffer);
    if (!text.trim()) throw new Error(`${file.name} has no text layer (a scanned or photographed page); upload it as typed text instead`);
    return text;
  }
  if (extension === ".docx") {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value;
  }

  throw new Error(`Unsupported file type "${extension || "(none)"}"; use TXT, PDF, or DOCX`);
}

export function loadLearners(csvText) {
  if (typeof csvText !== "string" || csvText.trim() === "") {
    throw new TypeError("Learner CSV must be a non-empty string");
  }

  const rows = parseCsv(csvText, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: false
  });
  const required = ["learner_id", "name", "grade", "email"];
  const learners = rows.map((row, index) => {
    for (const column of required) {
      if (!row[column]) {
        throw new Error(`Learner row ${index + 2} is missing "${column}"`);
      }
    }
    const isInboxPlaceholder = /^TEAM_INBOX_[1-3]$/u.test(row.email);
    if (!isInboxPlaceholder && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(row.email)) {
      throw new Error(`Learner row ${index + 2} has an invalid email address`);
    }
    return {
      learner_id: row.learner_id,
      name: row.name,
      grade: row.grade,
      email: row.email
    };
  });

  const ids = new Set(learners.map(({ learner_id }) => learner_id));
  if (ids.size !== learners.length) {
    throw new Error("Learner IDs must be unique");
  }
  return learners;
}
