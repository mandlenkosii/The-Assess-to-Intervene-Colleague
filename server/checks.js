import { normalizeWhitespace } from "./parse.js";
import { quoteExists } from "../shared/evidence.js";

export { quoteExists } from "../shared/evidence.js";

export function scoresInRange(mark, rubric) {
  const criteria = rubric.criteria || [];
  const rubricMaximums = new Map(criteria.map((criterion) => [criterion.name, criterion.max_score]));
  const scoredCriteria = new Set(mark.scores.map((score) => score.criterion));
  return mark.scores.every((score) => {
    const expectedMaximum = rubricMaximums.get(score.criterion);
    return Number.isInteger(score.score) &&
      Number.isInteger(score.max_score) &&
      score.score >= 0 &&
      score.score <= score.max_score &&
      expectedMaximum === score.max_score;
  }) &&
    mark.scores.length === criteria.length &&
    scoredCriteria.size === criteria.length &&
    criteria.every((criterion) => scoredCriteria.has(criterion.name));
}

export function totalMatches(mark) {
  const maximum = mark.scores.reduce((sum, score) => sum + score.max_score, 0);
  const earned = mark.scores.reduce((sum, score) => sum + score.score, 0);
  return maximum > 0 && Math.abs(mark.total_pct - (earned / maximum) * 100) < 0.01;
}

export function checkMark(mark, text, rubric) {
  const reasons = [];
  for (const score of mark.scores) {
    if (!quoteExists(score.evidence, text)) {
      reasons.push(`no evidence quoted for ${score.criterion}`);
    }
  }
  if (!scoresInRange(mark, rubric)) {
    reasons.push("scores are outside the rubric range or criteria do not match");
  }
  if (!totalMatches(mark)) {
    reasons.push("scores don't add up");
  }
  return { ok: reasons.length === 0, reasons };
}
