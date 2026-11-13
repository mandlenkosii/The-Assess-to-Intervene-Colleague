import { parse as parseCsv } from "csv-parse/sync";
import mammoth from "mammoth";
import pdf from "pdf-parse";

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
    const result = await pdf(file.buffer);
    return result.text;
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
