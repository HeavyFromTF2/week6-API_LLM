#!/usr/bin/env node
/**
 * Usage:
 *   node evals/run-eval.js            # runs against the deterministic stub (default, no quota spent)
 *   LLM_STUB=0 node evals/run-eval.js # runs against the real OpenRouter model (needs OPENROUTER_API_KEY)
 *
 * All paths are relative to this file (inside /ai-version), so it can be run
 * from any working directory.
 */
const path = require("path");
const fs = require("fs");

// Default to stub mode unless the caller explicitly opted into real calls.
if (process.env.LLM_STUB === undefined) process.env.LLM_STUB = "1";
if (process.env.LLM_ENABLED === undefined) process.env.LLM_ENABLED = "true";

const { categorizeTask } = require("../src/services/categorizeService");

const CASES_PATH = path.join(__dirname, "cases.json");

async function main() {
  const cases = JSON.parse(fs.readFileSync(CASES_PATH, "utf8"));
  let passed = 0;
  let failed = 0;

  console.log(`Running ${cases.length} eval cases (LLM_STUB=${process.env.LLM_STUB}, LLM_ENABLED=${process.env.LLM_ENABLED})\n`);

  for (const testCase of cases) {
    try {
      const result = await categorizeTask(testCase.input);
      const categoryOk = result.category === testCase.expect.category;
      const priorityOk = result.priority === testCase.expect.priority;
      const ok = categoryOk && priorityOk;

      if (ok) {
        passed++;
        console.log(`PASS  ${testCase.id}`);
      } else {
        failed++;
        console.log(`FAIL  ${testCase.id}`);
        console.log(`      input:    ${JSON.stringify(testCase.input)}`);
        console.log(`      expected: ${JSON.stringify(testCase.expect)}`);
        console.log(`      actual:   ${JSON.stringify({ category: result.category, priority: result.priority })}`);
      }
    } catch (err) {
      failed++;
      console.log(`ERROR ${testCase.id}: ${err.message}`);
    }
  }

  console.log(`\n${passed}/${cases.length} passed`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main();
