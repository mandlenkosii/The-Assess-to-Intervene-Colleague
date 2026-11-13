function normalizeWithOffsets(value) {
  let normalized = "";
  const starts = [];
  const ends = [];

  for (let index = 0; index < value.length;) {
    const character = String.fromCodePoint(value.codePointAt(index));
    const end = index + character.length;
    if (/\s/u.test(character)) {
      if (normalized.length > 0) {
        if (normalized.endsWith(" ")) {
          ends[ends.length - 1] = end;
        } else {
          normalized += " ";
          starts.push(index);
          ends.push(end);
        }
      }
    } else {
      const folded = character
        .replace(/[“”‘’]/gu, "'")
        .replace(/[‐‑‒–—]/gu, "-")
        .toLocaleLowerCase("en");
      for (const foldedCharacter of folded) {
        normalized += foldedCharacter;
        starts.push(index);
        ends.push(end);
      }
    }
    index = end;
  }

  if (normalized.endsWith(" ")) {
    normalized = normalized.slice(0, -1);
    starts.pop();
    ends.pop();
  }
  return { normalized, starts, ends };
}

export function normalizeEvidence(value) {
  return normalizeWithOffsets(value).normalized;
}

export function quoteExists(quote, text) {
  if (typeof quote !== "string" || quote.trim() === "" || typeof text !== "string") {
    return false;
  }
  const normalizedQuote = normalizeEvidence(quote);
  const normalizedText = normalizeEvidence(text);
  if (normalizedText.includes(normalizedQuote)) {
    return true;
  }

  const tokens = normalizedQuote.match(/[\p{L}\p{N}]+/gu) || [];
  if (tokens.length === 0) {
    return false;
  }
  const sourceTokens = normalizedText.match(/[\p{L}\p{N}]+/gu) || [];
  const requiredMatches = Math.ceil(tokens.length * 0.9);
  for (let start = 0; start + tokens.length <= sourceTokens.length; start += 1) {
    let matches = 0;
    for (let offset = 0; offset < tokens.length; offset += 1) {
      if (tokens[offset] === sourceTokens[start + offset]) {
        matches += 1;
      }
    }
    if (matches >= requiredMatches) {
      return true;
    }
  }
  return false;
}

export function findQuoteRanges(text, quotes) {
  if (typeof text !== "string" || !Array.isArray(quotes)) {
    return [];
  }
  const { normalized, starts, ends } = normalizeWithOffsets(text);
  const ranges = [];
  for (const quote of quotes) {
    if (typeof quote !== "string" || quote.trim() === "") {
      continue;
    }
    const needle = normalizeEvidence(quote).replace(/^['"]+|['"]+$/gu, "");
    let matchIndex = normalized.indexOf(needle);
    while (needle && matchIndex !== -1) {
      ranges.push({
        start: starts[matchIndex],
        end: ends[matchIndex + needle.length - 1]
      });
      matchIndex = normalized.indexOf(needle, matchIndex + needle.length);
    }
  }

  ranges.sort((left, right) => left.start - right.start || left.end - right.end);
  const merged = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}
