// Regression guard for feature flags: with every feature flag at its default (off), a full run of the
// built-in class on the deterministic fake model must produce exactly what main produced.
// tests/golden/run-output.json was captured from main (8be49af) before any feature code was added.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { env } from "../env.js";
import { goldenRun } from "./helpers/goldenRun.js";

const golden = JSON.parse(readFileSync(new URL("./golden/run-output.json", import.meta.url), "utf8"));

test("regression: with feature flags off, a full run matches the output captured from main", async () => {
  // Force every flag off, whatever the local .env says.
  const before = env.FEATURE_HANDWRITING;
  env.FEATURE_HANDWRITING = false;
  try { assert.deepEqual(await goldenRun(), golden); } finally { env.FEATURE_HANDWRITING = before; }
});
